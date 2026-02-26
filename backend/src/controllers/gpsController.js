const GPSService = require('../services/gpsService');
const { logger } = require('../config/logger');
const { broadcastCurrentLocation } = require('../config/socket');

const GPS_MIN_PROCESS_INTERVAL_MS = 2500;
const GPS_MIN_PROCESS_MOVE_METERS = 10;
const userGpsProcessState = new Map();

const calculateDistanceMeters = (lat1, lon1, lat2, lon2) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

class GPSController {
  constructor() {
    this.updatePosition = this.updatePosition.bind(this);
    this.getMyPosition = this.getMyPosition.bind(this);
    this.getAllActivePositions = this.getAllActivePositions.bind(this);
    this.enrichPositionsWithUserDetails = this.enrichPositionsWithUserDetails.bind(this);
  }

  async updatePosition(req, res) {
    try {
      const user = req.user;
      const gpsData = req.body;

      const latitude = Number(gpsData.latitude);
      const longitude = Number(gpsData.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid GPS coordinates',
        });
      }
      gpsData.latitude = latitude;
      gpsData.longitude = longitude;
      
      // Add user ID and audit context to GPS data
      gpsData.userId = user.User_ID;
      gpsData.auditContext = {
        ipAddress: req.ip,
        deviceInfo: req.get('User-Agent'),
      };

      const now = Date.now();
      const last = userGpsProcessState.get(user.User_ID);
      if (last) {
        const elapsed = now - last.timestamp;
        const movedMeters = calculateDistanceMeters(
          last.latitude,
          last.longitude,
          gpsData.latitude,
          gpsData.longitude
        );

        if (elapsed < GPS_MIN_PROCESS_INTERVAL_MS && movedMeters < GPS_MIN_PROCESS_MOVE_METERS) {
          return res.json({
            success: true,
            message: 'GPS update throttled',
            data: { logged: false, throttled: true },
          });
        }
      }

      userGpsProcessState.set(user.User_ID, {
        latitude: gpsData.latitude,
        longitude: gpsData.longitude,
        timestamp: now,
      });
      
      // Process GPS update
      const result = await GPSService.processGPSUpdate(gpsData);
      
      // Broadcast current location with milepost to user (for follow-me mode)
      if (result && result.milepost) {
        broadcastCurrentLocation(user.User_ID, {
          latitude: gpsData.latitude,
          longitude: gpsData.longitude,
          accuracy: gpsData.accuracy,
          heading: gpsData.heading,
          speed: gpsData.speed,
          milepost: result.milepost.milepost,
          trackType: result.milepost.trackType,
          trackNumber: result.milepost.trackNumber,
          confidence: result.milepost.confidence,
          distanceFromTrack: result.milepost.distanceFromTrack,
          timestamp: new Date()
        });
      }
      
      res.json({
        success: true,
        message: 'GPS position updated',
        data: result
      });
    } catch (error) {
      logger.error('Update GPS position error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update GPS position'
      });
    }
  }
  
  async getMyPosition(req, res) {
    try {
      const user = req.user;
      const position = await GPSService.getUserPosition(user.User_ID);
      
      if (!position) {
        return res.status(404).json({
          success: false,
          error: 'No recent position found'
        });
      }
      
      res.json({
        success: true,
        data: {
          position,
          timestamp: new Date(position.timestamp).toISOString()
        }
      });
    } catch (error) {
      logger.error('Get my position error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get position'
      });
    }
  }
  
  async getAllActivePositions(req, res) {
    try {
      const user = req.user;
      
      // Only supervisors and administrators can see all positions
      if (user.Role !== 'Supervisor' && user.Role !== 'Administrator') {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }
      
      const positions = await GPSService.getAllActivePositions();
      
      // Get user details for each position
      const positionsWithDetails = await this.enrichPositionsWithUserDetails(positions);
      const scopedPositions = user.Role === 'Administrator'
        ? positionsWithDetails
        : positionsWithDetails.filter((pos) => Number(pos?.user?.agencyId) === Number(user.Agency_ID));
      
      res.json({
        success: true,
        data: {
          positions: scopedPositions,
          count: scopedPositions.length
        }
      });
    } catch (error) {
      logger.error('Get all active positions error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get active positions'
      });
    }
  }
  
  async enrichPositionsWithUserDetails(positions) {
    const { getConnection, sql } = require('../config/database');
    const pool = getConnection();
    
    const enrichedPositions = [];
    
    for (const position of positions) {
      try {
        const query = `
          SELECT 
            u.User_ID,
            u.Employee_Name,
            u.Employee_Contact,
            u.Role,
            u.Agency_ID,
            a.Authority_ID,
            a.Track_Type,
            a.Track_Number,
            s.Subdivision_Code
          FROM Users u
          LEFT JOIN Authorities a ON u.User_ID = a.User_ID AND a.Is_Active = 1
          LEFT JOIN Subdivisions s ON a.Subdivision_ID = s.Subdivision_ID
          WHERE u.User_ID = @userId
        `;
        
        const result = await pool.request()
          .input('userId', sql.Int, position.userId)
          .query(query);
        
        if (result.recordset.length > 0) {
          enrichedPositions.push({
            ...position,
            user: {
              employeeName: result.recordset[0].Employee_Name,
              employeeContact: result.recordset[0].Employee_Contact,
              role: result.recordset[0].Role,
              agencyId: result.recordset[0].Agency_ID
            },
            authority: result.recordset[0].Authority_ID ? {
              authorityId: result.recordset[0].Authority_ID,
              trackType: result.recordset[0].Track_Type,
              trackNumber: result.recordset[0].Track_Number,
              subdivision: result.recordset[0].Subdivision_Code
            } : null
          });
        }
      } catch (error) {
        logger.error('Enrich position error:', error);
        // Still include basic position data
        enrichedPositions.push(position);
      }
    }
    
    return enrichedPositions;
  }
}

module.exports = new GPSController();
