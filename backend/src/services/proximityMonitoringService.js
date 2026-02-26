const { logger } = require('../config/logger');
const { getConnection, sql } = require('../config/database');
const { emitToUser, emitToAuthority } = require('../config/socket');
const { calculateTrackDistance } = require('../utils/geoCalculations');
const { logAuditEvent } = require('./auditEventService');

/**
 * Proximity Monitoring Service
 * Continuously monitors distance between workers with overlapping authorities
 * Provides escalating alerts at 1.0, 0.75, 0.5, and 0.25 mile thresholds
 */

class ProximityMonitoringService {
  constructor() {
    this.monitoringInterval = null;
    this.checkIntervalMs = 30000; // Check every 30 seconds
    this.proximityThresholds = [1.0, 0.75, 0.5, 0.25]; // Miles, in descending order
    this.lastAlertSent = new Map(); // Track last alert time per user pair
    this.alertCooldownMs = 60000; // 1 minute cooldown between same alerts
  }

  /**
   * Start the proximity monitoring service
   */
  start() {
    if (this.monitoringInterval) {
      logger.warn('Proximity monitoring service already running');
      return;
    }

    logger.info('Starting proximity monitoring service');
    this.monitoringInterval = setInterval(
      () => this.checkAllProximities(),
      this.checkIntervalMs
    );
  }

  /**
   * Stop the proximity monitoring service
   */
  stop() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('Proximity monitoring service stopped');
    }
  }

  /**
   * Check proximities for all active authorities
   */
  async checkAllProximities() {
    try {
      const pool = getConnection();

      // Get all active authorities with their latest GPS positions
      const query = `
        SELECT 
          a.Authority_ID,
          a.User_ID,
          a.Subdivision_ID,
          a.Track_Type,
          a.Track_Number,
          a.Begin_MP,
          a.End_MP,
          u.Employee_Name,
          u.Email,
          s.Subdivision_Code,
          g.Latitude,
          g.Longitude,
          g.Created_Date as GPS_Time
        FROM Authorities a
        INNER JOIN Users u ON a.User_ID = u.User_ID
        INNER JOIN Subdivisions s ON a.Subdivision_ID = s.Subdivision_ID
        OUTER APPLY (
          SELECT TOP 1 
            Latitude, 
            Longitude, 
            Created_Date
          FROM GPS_Logs
          WHERE User_ID = a.User_ID
            AND Authority_ID = a.Authority_ID
          ORDER BY Created_Date DESC
        ) g
        WHERE a.Is_Active = 1
          AND g.Created_Date IS NOT NULL
          AND g.Created_Date > DATEADD(MINUTE, -5, GETDATE())
      `;

      const result = await pool.request().query(query);
      const authorities = result.recordset;

      if (authorities.length < 2) {
        // Need at least 2 active authorities to check proximity
        return;
      }

      // Check for overlapping authorities
      const overlaps = this.findOverlappingAuthorities(authorities);

      // Check proximity for each overlapping pair
      for (const overlap of overlaps) {
        await this.checkProximityPair(overlap.authority1, overlap.authority2);
      }

      logger.debug(`Checked ${overlaps.length} authority pairs for proximity`);
    } catch (error) {
      logger.error('Error in proximity monitoring:', error);
    }
  }

  /**
   * Find authorities that overlap on the same track
   */
  findOverlappingAuthorities(authorities) {
    const overlaps = [];

    for (let i = 0; i < authorities.length; i++) {
      for (let j = i + 1; j < authorities.length; j++) {
        const a1 = authorities[i];
        const a2 = authorities[j];

        // Check if on same subdivision and track
        if (
          a1.Subdivision_ID === a2.Subdivision_ID &&
          a1.Track_Type === a2.Track_Type &&
          a1.Track_Number === a2.Track_Number
        ) {
          // Check if mileposts overlap
          const overlap = this.checkMilepostOverlap(
            a1.Begin_MP,
            a1.End_MP,
            a2.Begin_MP,
            a2.End_MP
          );

          if (overlap) {
            overlaps.push({
              authority1: a1,
              authority2: a2
            });
          }
        }
      }
    }

    return overlaps;
  }

  /**
   * Check if two milepost ranges overlap
   */
  checkMilepostOverlap(begin1, end1, begin2, end2) {
    return (
      (begin1 >= begin2 && begin1 <= end2) ||
      (end1 >= begin2 && end1 <= end2) ||
      (begin2 >= begin1 && begin2 <= end1) ||
      (end2 >= begin1 && end2 <= end1)
    );
  }

  /**
   * Check proximity between two workers and send alerts if needed
   */
  async checkProximityPair(auth1, auth2) {
    try {
      // Calculate track-based distance between workers
      let distance;

      if (auth1.Calculated_MP && auth2.Calculated_MP) {
        // Use calculated mileposts for accurate distance
        distance = Math.abs(auth1.Calculated_MP - auth2.Calculated_MP);
      } else if (auth1.Latitude && auth1.Longitude && auth2.Latitude && auth2.Longitude) {
        // Fall back to track distance calculation
        distance = await calculateTrackDistance(
          auth1.Subdivision_ID,
          { lat: auth1.Latitude, lon: auth1.Longitude },
          { lat: auth2.Latitude, lon: auth2.Longitude }
        );
      } else {
        // No position data available
        return;
      }

      // Determine alert level based on distance
      const alertLevel = this.getAlertLevel(distance);

      if (alertLevel) {
        // Check if we should send alert (cooldown period)
        const shouldSend = this.shouldSendAlert(
          auth1.User_ID,
          auth2.User_ID,
          alertLevel.threshold
        );

        if (shouldSend) {
          await this.sendProximityAlert(auth1, auth2, distance, alertLevel);
        }
      }
    } catch (error) {
      logger.error('Error checking proximity pair:', error);
    }
  }

  /**
   * Get alert level based on distance
   */
  getAlertLevel(distance) {
    for (const threshold of this.proximityThresholds) {
      if (distance <= threshold) {
        return {
          threshold,
          level: this.getAlertSeverity(threshold),
          color: this.getAlertColor(threshold)
        };
      }
    }
    return null;
  }

  /**
   * Get alert severity based on threshold
   */
  getAlertSeverity(threshold) {
    if (threshold <= 0.25) {
      return 'Critical';
    }
    if (threshold <= 0.5) {
      return 'Warning';
    }
    return 'Info';
  }

  /**
   * Get alert color based on threshold
   */
  getAlertColor(threshold) {
    if (threshold <= 0.25) {
      return '#C70039'; // Red
    }
    if (threshold <= 0.5) {
      return '#FFC300'; // Yellow
    }
    if (threshold <= 0.75) {
      return '#FFD100'; // Light yellow
    }
    return '#3498DB'; // Blue
  }

  /**
   * Check if alert should be sent (cooldown logic)
   */
  shouldSendAlert(userId1, userId2, threshold) {
    const pairKey = this.getPairKey(userId1, userId2, threshold);
    const lastAlert = this.lastAlertSent.get(pairKey);

    if (!lastAlert) {
      return true;
    }

    const timeSinceLastAlert = Date.now() - lastAlert;
    return timeSinceLastAlert >= this.alertCooldownMs;
  }

  /**
   * Get unique key for user pair and threshold
   */
  getPairKey(userId1, userId2, threshold) {
    const sortedIds = [userId1, userId2].sort();
    return `${sortedIds[0]}-${sortedIds[1]}-${threshold}`;
  }

  /**
   * Send proximity alert to both workers
   */
  async sendProximityAlert(auth1, auth2, distance, alertLevel) {
    try {
      const alert = {
        type: 'proximity',
        level: alertLevel.level,
        threshold: alertLevel.threshold,
        distance: distance.toFixed(2),
        timestamp: new Date(),
        worker1: {
          userId: auth1.User_ID,
          name: auth1.Employee_Name,
          authorityId: auth1.Authority_ID,
          milepost: auth1.Calculated_MP?.toFixed(4) || 'Unknown'
        },
        worker2: {
          userId: auth2.User_ID,
          name: auth2.Employee_Name,
          authorityId: auth2.Authority_ID,
          milepost: auth2.Calculated_MP?.toFixed(4) || 'Unknown'
        },
        track: {
          subdivision: auth1.Subdivision_Code,
          type: auth1.Track_Type,
          number: auth1.Track_Number
        },
        message: `${auth2.Employee_Name} is ${distance.toFixed(2)} miles away on ${auth1.Track_Type} ${auth1.Track_Number}`,
        color: alertLevel.color
      };

      // Send to worker 1
      emitToUser(auth1.User_ID, 'proximity-alert', {
        ...alert,
        otherWorker: {
          userId: auth2.User_ID,
          name: auth2.Employee_Name,
          milepost: auth2.Calculated_MP?.toFixed(4) || 'Unknown'
        }
      });
      emitToUser(auth1.User_ID, 'proximity_alert', {
        ...alert,
        otherWorker: {
          userId: auth2.User_ID,
          name: auth2.Employee_Name,
          milepost: auth2.Calculated_MP?.toFixed(4) || 'Unknown'
        }
      });

      // Send to worker 2
      emitToUser(auth2.User_ID, 'proximity-alert', {
        ...alert,
        otherWorker: {
          userId: auth1.User_ID,
          name: auth1.Employee_Name,
          milepost: auth1.Calculated_MP?.toFixed(4) || 'Unknown'
        }
      });
      emitToUser(auth2.User_ID, 'proximity_alert', {
        ...alert,
        otherWorker: {
          userId: auth1.User_ID,
          name: auth1.Employee_Name,
          milepost: auth1.Calculated_MP?.toFixed(4) || 'Unknown'
        }
      });

      // Broadcast to authority rooms
      emitToAuthority(auth1.Authority_ID, 'proximity-alert', alert);
      emitToAuthority(auth2.Authority_ID, 'proximity-alert', alert);
      emitToAuthority(auth1.Authority_ID, 'proximity_alert', alert);
      emitToAuthority(auth2.Authority_ID, 'proximity_alert', alert);

      // Log alert to database
      await this.logProximityAlert(auth1, auth2, distance, alertLevel);

      // Update last alert time
      const pairKey = this.getPairKey(auth1.User_ID, auth2.User_ID, alertLevel.threshold);
      this.lastAlertSent.set(pairKey, Date.now());

      logger.info(
        `Proximity alert: ${auth1.Employee_Name} and ${auth2.Employee_Name} are ${distance.toFixed(2)} miles apart (${alertLevel.level})`
      );
    } catch (error) {
      logger.error('Error sending proximity alert:', error);
    }
  }

  /**
   * Log proximity alert to database
   */
  async logProximityAlert(auth1, auth2, distance, alertLevel) {
    try {
      const pool = getConnection();

      const query = `
        INSERT INTO Alert_Logs (
          Alert_Type,
          Alert_Level,
          User_ID,
          Authority_ID,
          Message,
          Alert_Data
        )
        VALUES 
          (@alertType, @alertLevel, @userId1, @authorityId1, @message1, @alertData),
          (@alertType, @alertLevel, @userId2, @authorityId2, @message2, @alertData)
      `;

      const alertData = JSON.stringify({
        distance,
        threshold: alertLevel.threshold,
        otherWorkerId: null, // Will be set per row
        subdivision: auth1.Subdivision_Code,
        track: `${auth1.Track_Type} ${auth1.Track_Number}`
      });

      await pool.request()
        .input('alertType', sql.VarChar(50), 'Proximity')
        .input('alertLevel', sql.VarChar(20), alertLevel.level)
        .input('userId1', sql.Int, auth1.User_ID)
        .input('authorityId1', sql.Int, auth1.Authority_ID)
        .input('message1', sql.VarChar(500), `${auth2.Employee_Name} is ${distance.toFixed(2)} miles away`)
        .input('userId2', sql.Int, auth2.User_ID)
        .input('authorityId2', sql.Int, auth2.Authority_ID)
        .input('message2', sql.VarChar(500), `${auth1.Employee_Name} is ${distance.toFixed(2)} miles away`)
        .input('alertData', sql.NVarChar(sql.MAX), alertData)
        .query(query);

      await logAuditEvent({
        userId: auth1.User_ID,
        actionType: 'PROXIMITY_EVENT',
        tableName: 'Alert_Logs',
        recordId: auth1.Authority_ID,
        newValue: {
          otherUserId: auth2.User_ID,
          distanceMiles: Number(distance).toFixed(2),
          thresholdMiles: alertLevel.threshold,
          level: alertLevel.level,
        },
      });

      await logAuditEvent({
        userId: auth2.User_ID,
        actionType: 'PROXIMITY_EVENT',
        tableName: 'Alert_Logs',
        recordId: auth2.Authority_ID,
        newValue: {
          otherUserId: auth1.User_ID,
          distanceMiles: Number(distance).toFixed(2),
          thresholdMiles: alertLevel.threshold,
          level: alertLevel.level,
        },
      });
    } catch (error) {
      logger.error('Error logging proximity alert:', error);
    }
  }

  /**
   * Get proximity status for a specific authority
   */
  async getProximityStatus(authorityId) {
    try {
      const pool = getConnection();

      const query = `
        SELECT 
          a2.Authority_ID as Other_Authority_ID,
          a2.User_ID as Other_User_ID,
          u2.Employee_Name as Other_Worker_Name,
          g1.Calculated_MP as My_MP,
          g2.Calculated_MP as Other_MP,
          ABS(g1.Calculated_MP - g2.Calculated_MP) as Distance,
          g1.GPS_Time as My_Last_Update,
          g2.GPS_Time as Other_Last_Update
        FROM Authorities a1
        INNER JOIN Authorities a2 ON 
          a1.Subdivision_ID = a2.Subdivision_ID AND
          a1.Track_Type = a2.Track_Type AND
          a1.Track_Number = a2.Track_Number AND
          a1.Authority_ID != a2.Authority_ID AND
          a2.Is_Active = 1
        INNER JOIN Users u2 ON a2.User_ID = u2.User_ID
        OUTER APPLY (
          SELECT TOP 1 Calculated_MP, GPS_Time
          FROM GPS_Logs
          WHERE User_ID = a1.User_ID AND Authority_ID = a1.Authority_ID
          ORDER BY GPS_Time DESC
        ) g1
        OUTER APPLY (
          SELECT TOP 1 Calculated_MP, GPS_Time
          FROM GPS_Logs
          WHERE User_ID = a2.User_ID AND Authority_ID = a2.Authority_ID
          ORDER BY GPS_Time DESC
        ) g2
        WHERE a1.Authority_ID = @authorityId
          AND a1.Is_Active = 1
          AND g1.Calculated_MP IS NOT NULL
          AND g2.Calculated_MP IS NOT NULL
          AND g1.GPS_Time > DATEADD(MINUTE, -5, GETDATE())
          AND g2.GPS_Time > DATEADD(MINUTE, -5, GETDATE())
          AND (
            (a1.Begin_MP BETWEEN a2.Begin_MP AND a2.End_MP) OR
            (a1.End_MP BETWEEN a2.Begin_MP AND a2.End_MP) OR
            (a2.Begin_MP BETWEEN a1.Begin_MP AND a1.End_MP) OR
            (a2.End_MP BETWEEN a1.Begin_MP AND a1.End_MP)
          )
        ORDER BY Distance
      `;

      const result = await pool.request()
        .input('authorityId', sql.Int, authorityId)
        .query(query);

      return result.recordset.map(row => ({
        otherAuthorityId: row.Other_Authority_ID,
        otherUserId: row.Other_User_ID,
        otherWorkerName: row.Other_Worker_Name,
        myMilepost: row.My_MP,
        otherMilepost: row.Other_MP,
        distance: parseFloat(row.Distance).toFixed(2),
        alertLevel: this.getAlertLevel(parseFloat(row.Distance)),
        lastUpdated: row.Other_Last_Update
      }));
    } catch (error) {
      logger.error('Error getting proximity status:', error);
      return [];
    }
  }
}

// Export singleton instance
module.exports = new ProximityMonitoringService();
