const Agency = require('../models/Agency');
const User = require('../models/User');
// Removed unused model imports (they are used via DB seeding/helpers when needed)
const { logger } = require('../config/logger');
const { getConnection, getConnectionWithRecovery, sql } = require('../config/database');
const { isGlobalAdmin } = require('../utils/rbac');

const TRANSIENT_DB_CODES = new Set(['ESOCKET', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT']);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isTransientDbError = (error) => {
  if (!error) return false;
  if (error.code && TRANSIENT_DB_CODES.has(error.code)) return true;
  const message = String(error.message || '').toLowerCase();
  return (
    message.includes('connection lost') ||
    message.includes('econnreset') ||
    message.includes('failed to connect') ||
    message.includes('timeout') ||
    message.includes('aborted')
  );
};

const queryWithRetry = async (requestFactory, query, context, maxRetries = 5) => {
  let lastError;
  let forceReconnect = false;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const pool = await getConnectionWithRecovery({ forceReconnect });
      const request = requestFactory(pool);
      forceReconnect = false;
      return await request.query(query);
    } catch (error) {
      lastError = error;
      if (!isTransientDbError(error) || attempt >= maxRetries) {
        throw error;
      }

      forceReconnect = true;
      const delay = 200 * (2 ** (attempt - 1));
      logger.warn(`Agency query attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms`, {
        context,
        error: error.message,
      });
      // eslint-disable-next-line no-await-in-loop
      await sleep(delay);
    }
  }

  throw lastError;
};

class AgencyController {
  async getAllAgencies(req, res) {
    try {
      const { page = 1, limit = 20, search = '' } = req.query;

      if (!isGlobalAdmin(req.user)) {
        const agency = await Agency.findById(req.user.Agency_ID);
        return res.json({
          success: true,
          data: {
            agencies: agency ? [agency] : [],
            total: agency ? 1 : 0,
            page: 1,
            limit: 1,
            totalPages: agency ? 1 : 0
          }
        });
      }
      
      const result = await Agency.findAll({
        page: parseInt(page),
        limit: parseInt(limit),
        search
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Get agencies error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get agencies'
      });
    }
  }

  async getAgencyById(req, res) {
    try {
      const { agencyId } = req.params;
      const agency = await Agency.findById(agencyId);
      
      if (!agency) {
        return res.status(404).json({
          success: false,
          error: 'Agency not found'
        });
      }

      res.json({
        success: true,
        data: { agency }
      });
    } catch (error) {
      logger.error('Get agency error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get agency'
      });
    }
  }

  async createAgency(req, res) {
    try {
      const agencyData = req.body;
      
      // Check if agency code already exists
      const existingAgency = await Agency.findByCode(agencyData.agencyCD);
      if (existingAgency) {
        return res.status(400).json({
          success: false,
          error: 'Agency code already exists'
        });
      }

      const agency = await Agency.create(agencyData);

      // Create default configurations for the new agency
      await this.createDefaultConfigurations(agency.Agency_ID);

      logger.info(`New agency created: ${agency.Agency_CD} (${agency.Agency_Name}) by user ${req.user.User_ID}`);

      res.status(201).json({
        success: true,
        data: { agency },
        message: 'Agency created successfully'
      });
    } catch (error) {
      logger.error('Create agency error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create agency'
      });
    }
  }

  async updateAgency(req, res) {
    try {
      const { agencyId } = req.params;
      const updateData = req.body;

      // Check if agency exists
      const existingAgency = await Agency.findById(agencyId);
      if (!existingAgency) {
        return res.status(404).json({
          success: false,
          error: 'Agency not found'
        });
      }

      // Map camelCase to database column names
      const mappedData = {};
      if (updateData.agencyName) mappedData.Agency_Name = updateData.agencyName;
      if (updateData.region) mappedData.Region = updateData.region;
      if (updateData.contactEmail) mappedData.Contact_Email = updateData.contactEmail;
      if (updateData.contactPhone) mappedData.Contact_Phone = updateData.contactPhone;
      
      const agency = await Agency.update(agencyId, mappedData);

      logger.info(`Agency updated: ${agency.Agency_CD} by user ${req.user.User_ID}`);

      res.json({
        success: true,
        data: { agency },
        message: 'Agency updated successfully'
      });
    } catch (error) {
      logger.error('Update agency error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update agency'
      });
    }
  }

  async deleteAgency(req, res) {
    try {
      const { agencyId } = req.params;

      // Check if agency exists
      const agency = await Agency.findById(agencyId);
      if (!agency) {
        return res.status(404).json({
          success: false,
          error: 'Agency not found'
        });
      }

      // Check if agency has active users
      const users = await User.findByAgency(agencyId, 1, 1);
      if (users.total > 0) {
        return res.status(400).json({
          success: false,
          error: 'Cannot delete agency with active users'
        });
      }

      // Soft delete (deactivate) the agency
      await Agency.deactivate(agencyId);

      logger.warn(`Agency deactivated: ${agency.Agency_CD} by user ${req.user.User_ID}`);

      res.json({
        success: true,
        message: 'Agency deactivated successfully'
      });
    } catch (error) {
      logger.error('Delete agency error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete agency'
      });
    }
  }

  async getAgencyStats(req, res) {
    try {
      const { agencyId } = req.params;
      
      const pool = getConnection();
      
      // Get agency statistics
      const statsQuery = `
        SELECT 
          (SELECT COUNT(*) FROM Users WHERE Agency_ID = @agencyId AND Is_Active = 1) as user_count,
          (SELECT COUNT(*) FROM Subdivisions WHERE Agency_ID = @agencyId AND Is_Active = 1) as subdivision_count,
          (SELECT COUNT(*) FROM Authorities a 
           INNER JOIN Subdivisions s ON a.Subdivision_ID = s.Subdivision_ID 
           WHERE s.Agency_ID = @agencyId AND a.Is_Active = 1) as active_authorities,
          (SELECT COUNT(*) FROM Authorities a 
           INNER JOIN Subdivisions s ON a.Subdivision_ID = s.Subdivision_ID 
           WHERE s.Agency_ID = @agencyId AND a.End_Tracking_Confirmed = 1 
           AND a.Created_Date >= DATEADD(day, -30, GETDATE())) as completed_authorities_30d,
          (SELECT COUNT(*) FROM Pins p 
           INNER JOIN Authorities a ON p.Authority_ID = a.Authority_ID
           INNER JOIN Subdivisions s ON a.Subdivision_ID = s.Subdivision_ID 
           WHERE s.Agency_ID = @agencyId 
           AND p.Created_Date >= DATEADD(day, -7, GETDATE())) as pins_7d
      `;
      
      const statsResult = await pool.request()
        .input('agencyId', sql.Int, agencyId)
        .query(statsQuery);
      
      // Get recent activity
      const activityQuery = `
        SELECT TOP 10
          'Authority Created' as activity_type,
          a.Employee_Name_Display as user_name,
          s.Subdivision_Code,
          a.Track_Type + ' ' + a.Track_Number as track,
          a.Created_Date
        FROM Authorities a
        INNER JOIN Subdivisions s ON a.Subdivision_ID = s.Subdivision_ID
        WHERE s.Agency_ID = @agencyId
          AND a.Created_Date >= DATEADD(day, -7, GETDATE())
        
        UNION ALL
        
        SELECT TOP 10
          'Pin Dropped' as activity_type,
          u.Employee_Name as user_name,
          s.Subdivision_Code,
          p.Track_Type + ' ' + ISNULL(p.Track_Number, '') as track,
          p.Created_Date
        FROM Pins p
        INNER JOIN Authorities a ON p.Authority_ID = a.Authority_ID
        INNER JOIN Subdivisions s ON a.Subdivision_ID = s.Subdivision_ID
        INNER JOIN Users u ON a.User_ID = u.User_ID
        WHERE s.Agency_ID = @agencyId
          AND p.Created_Date >= DATEADD(day, -7, GETDATE())
        
        ORDER BY Created_Date DESC
      `;
      
      const activityResult = await pool.request()
        .input('agencyId', sql.Int, agencyId)
        .query(activityQuery);
      
      res.json({
        success: true,
        data: {
          stats: statsResult.recordset[0],
          recentActivity: activityResult.recordset
        }
      });
    } catch (error) {
      logger.error('Get agency stats error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get agency statistics'
      });
    }
  }

  async createDefaultConfigurations(agencyId) {
    const pool = getConnection();
    
    try {
      // Create default alert configurations
      const alertConfigs = [
        // Boundary Alerts
        { configType: 'Boundary_Alert', alertLevel: 'Informational', distanceMiles: 1.00 },
        { configType: 'Boundary_Alert', alertLevel: 'Warning', distanceMiles: 0.75 },
        { configType: 'Boundary_Alert', alertLevel: 'Critical', distanceMiles: 0.50 },
        
        // Proximity Alerts
        { configType: 'Proximity_Alert', alertLevel: 'Informational', distanceMiles: 1.00 },
        { configType: 'Proximity_Alert', alertLevel: 'Warning', distanceMiles: 0.75 },
        { configType: 'Proximity_Alert', alertLevel: 'Critical', distanceMiles: 0.50 },
        
        // Overlap Alerts
        { configType: 'Overlap_Alert', alertLevel: 'Critical', distanceMiles: 0.00 }
      ];
      
      for (const config of alertConfigs) {
        await pool.request()
          .input('agencyId', sql.Int, agencyId)
          .input('configType', sql.NVarChar, config.configType)
          .input('alertLevel', sql.NVarChar, config.alertLevel)
          .input('distanceMiles', sql.Decimal(5,2), config.distanceMiles)
          .query(`
            INSERT INTO Alert_Configurations (Agency_ID, Config_Type, Alert_Level, Distance_Miles, Is_Active)
            VALUES (@agencyId, @configType, @alertLevel, @distanceMiles, 1)
          `);
      }
      
      // Create default pin types
      const pinTypes = [
        { category: 'Scrap', subtype: 'Scrap - Rail', color: '#FF0000' },
        { category: 'Scrap', subtype: 'Scrap - Ties', color: '#FF9900' },
        { category: 'Monitor', subtype: 'Monitor Location', color: '#0099FF' },
        { category: 'Hazard', subtype: 'Track Obstruction', color: '#FF0000' },
        { category: 'Hazard', subtype: 'Damaged Rail', color: '#990000' },
        { category: 'Hazard', subtype: 'Flooding', color: '#0000FF' }
      ];
      
      for (const pinType of pinTypes) {
        await pool.request()
          .input('agencyId', sql.Int, agencyId)
          .input('category', sql.NVarChar, pinType.category)
          .input('subtype', sql.NVarChar, pinType.subtype)
          .input('color', sql.NVarChar, pinType.color)
          .query(`
            INSERT INTO Pin_Types (Agency_ID, Pin_Category, Pin_Subtype, Color, Is_Active)
            VALUES (@agencyId, @category, @subtype, @color, 1)
          `);
      }
      
      // Create default branding configuration
      await pool.request()
        .input('agencyId', sql.Int, agencyId)
        .query(`
          INSERT INTO Branding_Configurations (Agency_ID, App_Name, Primary_Color, Secondary_Color, Accent_Color)
          VALUES (@agencyId, 'Sidekick', '#000000', '#FFFFFF', '#FFD100')
        `);
      
      logger.info(`Default configurations created for agency ${agencyId}`);
      
    } catch (error) {
      logger.error('Create default configurations error:', error);
      throw error;
    }
  }

  async getAgencySubdivisions(req, res) {
    try {
      const { agencyId } = req.params;

      let result = await queryWithRetry(
        (pool) => pool.request()
          .input('agencyId', sql.Int, agencyId),
        `
          SELECT 
            Subdivision_ID,
            Subdivision_Code,
            Subdivision_Name,
            Is_Active
          FROM Subdivisions
          WHERE Agency_ID = @agencyId
            AND (Is_Active = 1 OR Is_Active IS NULL)
          ORDER BY Subdivision_Code
        `,
        'getAgencySubdivisions.list'
      );

      // Dev bootstrap: if an agency has no subdivisions or no track data,
      // create starter rows so local mobile flows can proceed.
      let shouldBootstrap = false;
      if (process.env.NODE_ENV !== 'production') {
        if (result.recordset.length === 0) {
          shouldBootstrap = true;
        } else {
          const trackCountResult = await queryWithRetry(
            (pool) => pool.request()
              .input('agencyId', sql.Int, agencyId),
            `
              SELECT COUNT(*) AS Count
              FROM Tracks t
              INNER JOIN Subdivisions s ON t.Subdivision_ID = s.Subdivision_ID
              WHERE s.Agency_ID = @agencyId
            `,
            'getAgencySubdivisions.trackCount'
          );

          const trackCount = trackCountResult.recordset[0]?.Count || 0;
          shouldBootstrap = trackCount < 10;
        }
      }

      if (shouldBootstrap) {
        const starterSubdivisions = [
          { code: 'MAIN', name: 'Main Subdivision' },
          { code: 'NORTH', name: 'North Subdivision' },
        ];

        for (const sub of starterSubdivisions) {
          await queryWithRetry(
            (pool) => pool.request()
              .input('agencyId', sql.Int, agencyId)
              .input('code', sql.NVarChar, sub.code)
              .input('name', sql.NVarChar, sub.name),
            `
              IF NOT EXISTS (
                SELECT 1
                FROM Subdivisions
                WHERE Agency_ID = @agencyId
                  AND Subdivision_Code = @code
              )
              BEGIN
                INSERT INTO Subdivisions (Agency_ID, Subdivision_Code, Subdivision_Name, Region, Is_Active)
                VALUES (@agencyId, @code, @name, 'Default', 1)
              END
            `,
            `getAgencySubdivisions.bootstrap.insertSubdivision.${sub.code}`
          );

          const subRow = await queryWithRetry(
            (pool) => pool.request()
              .input('agencyId', sql.Int, agencyId)
              .input('code', sql.NVarChar, sub.code),
            `
              SELECT TOP 1 Subdivision_ID
              FROM Subdivisions
              WHERE Agency_ID = @agencyId
                AND Subdivision_Code = @code
            `,
            `getAgencySubdivisions.bootstrap.findSubdivision.${sub.code}`
          );

          const subdivisionId = subRow.recordset[0]?.Subdivision_ID;
          if (!subdivisionId) {
            continue;
          }

          // Seed starter track assets for map-layer counts in local/dev environments.
          await queryWithRetry(
            (pool) => pool.request()
              .input('subdivisionId', sql.Int, subdivisionId),
            `
              IF NOT EXISTS (
                SELECT 1
                FROM Tracks
                WHERE Subdivision_ID = @subdivisionId
              )
              BEGIN
                INSERT INTO Tracks (
                  Subdivision_ID, LS, Track_Type, Track_Number, BMP, EMP,
                  Asset_Name, Asset_Type, Asset_SubType, Asset_Status, Latitude, Longitude, Department
                )
                VALUES
                  (@subdivisionId, 'LS-1', 'Main', '1', 0.00, 5.00, 'Signal A', 'Signal', 'Wayside', 'ACTIVE', 34.052235, -118.243683, 'Engineering'),
                  (@subdivisionId, 'LS-2', 'Main', '2', 0.00, 5.00, 'Road Crossing A', 'Crossing', 'Road Crossing', 'ACTIVE', 34.054235, -118.241683, 'Engineering'),
                  (@subdivisionId, 'LS-3', 'Main', '1', 5.00, 10.00, 'Rail Crossing A', 'Crossing', 'Rail Crossing', 'ACTIVE', 34.056235, -118.239683, 'Engineering'),
                  (@subdivisionId, 'LS-4', 'Main', '2', 5.00, 10.00, 'Turnout A', 'Switch', 'Turnout', 'ACTIVE', 34.058235, -118.237683, 'Engineering'),
                  (@subdivisionId, 'LS-5', 'Main', '1', 10.00, 15.00, 'Detector A', 'Other', 'Detector', 'ACTIVE', 34.060235, -118.235683, 'Engineering'),
                  (@subdivisionId, 'LS-6', 'Main', '2', 10.00, 15.00, 'Derail A', 'Other', 'Derail', 'ACTIVE', 34.062235, -118.233683, 'Engineering'),
                  (@subdivisionId, 'LS-7', 'Main', '1', 15.00, 20.00, 'Tunnel A', 'Other', 'Tunnel', 'ACTIVE', 34.064235, -118.231683, 'Engineering'),
                  (@subdivisionId, 'LS-8', 'Main', '2', 15.00, 20.00, 'Bridge A', 'Other', 'Bridge', 'ACTIVE', 34.066235, -118.229683, 'Engineering'),
                  (@subdivisionId, 'LS-9', 'Main', '1', 20.00, 25.00, 'Arch A', 'Other', 'Arch', 'ACTIVE', 34.068235, -118.227683, 'Engineering'),
                  (@subdivisionId, 'LS-10', 'Main', '2', 20.00, 25.00, 'Culvert A', 'Other', 'Culvert', 'ACTIVE', 34.070235, -118.225683, 'Engineering'),
                  (@subdivisionId, 'LS-11', 'Main', '1', 25.00, 30.00, 'Depot A', 'Other', 'Depot', 'ACTIVE', 34.072235, -118.223683, 'Engineering'),
                  (@subdivisionId, 'LS-12', 'Main', '2', 25.00, 30.00, 'Station A', 'Other', 'Station', 'ACTIVE', 34.074235, -118.221683, 'Engineering'),
                  (@subdivisionId, 'LS-13', 'Main', '1', 30.00, 35.00, 'Control Point CP-1', 'Other', 'Control Point', 'ACTIVE', 34.076235, -118.219683, 'Engineering'),
                  (@subdivisionId, 'LS-14', 'Main', '2', 30.00, 35.00, 'Snowshed A', 'Other', 'Snowshed', 'ACTIVE', 34.078235, -118.217683, 'Engineering');
              END
            `,
            `getAgencySubdivisions.bootstrap.seedTracks.${subdivisionId}`
          );

          await queryWithRetry(
            (pool) => pool.request()
              .input('subdivisionId', sql.Int, subdivisionId),
            `
              IF NOT EXISTS (
                SELECT 1
                FROM Milepost_Geometry
                WHERE Subdivision_ID = @subdivisionId
              )
              BEGIN
                INSERT INTO Milepost_Geometry (
                  Subdivision_ID, MP, Latitude, Longitude, Apple_Map_URL, Google_Map_URL
                )
                VALUES
                  (@subdivisionId, 0.00, 34.052235, -118.243683, NULL, NULL),
                  (@subdivisionId, 2.50, 34.053235, -118.242683, NULL, NULL),
                  (@subdivisionId, 5.00, 34.054235, -118.241683, NULL, NULL);
              END
            `,
            `getAgencySubdivisions.bootstrap.seedMileposts.${subdivisionId}`
          );
        }

        result = await queryWithRetry(
          (pool) => pool.request()
            .input('agencyId', sql.Int, agencyId),
          `
            SELECT 
              Subdivision_ID,
              Subdivision_Code,
              Subdivision_Name,
              Is_Active
            FROM Subdivisions
            WHERE Agency_ID = @agencyId
              AND (Is_Active = 1 OR Is_Active IS NULL)
            ORDER BY Subdivision_Code
          `,
          'getAgencySubdivisions.listAfterBootstrap'
        );
      }
      
      res.json({
        success: true,
        data: result.recordset
      });
    } catch (error) {
      logger.error('Get agency subdivisions error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get subdivisions'
      });
    }
  }

  async getSubdivisionTracks(req, res) {
    try {
      const { agencyId, subdivisionId } = req.params;

      // Verify subdivision belongs to agency
      const subdivisionCheck = await queryWithRetry(
        (pool) => pool.request()
          .input('agencyId', sql.Int, agencyId)
          .input('subdivisionId', sql.Int, subdivisionId),
        `
          SELECT Subdivision_ID
          FROM Subdivisions
          WHERE Agency_ID = @agencyId AND Subdivision_ID = @subdivisionId
        `,
        'getSubdivisionTracks.verifySubdivision'
      );
      
      if (subdivisionCheck.recordset.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Subdivision not found for this agency'
        });
      }
      
      // Get distinct track numbers for this subdivision
      const result = await queryWithRetry(
        (pool) => pool.request()
          .input('subdivisionId', sql.Int, subdivisionId),
        `
          SELECT DISTINCT
            Track_Type,
            Track_Number
          FROM Tracks
          WHERE Subdivision_ID = @subdivisionId
          AND Asset_Status = 'ACTIVE'
          ORDER BY Track_Type, Track_Number
        `,
        'getSubdivisionTracks.listTracks'
      );

      if (result.recordset.length === 0 && process.env.NODE_ENV !== 'production') {
        return res.json({
          success: true,
          data: [
            { Track_Type: 'Main', Track_Number: '1' },
            { Track_Type: 'Main', Track_Number: '2' },
          ]
        });
      }
      
      res.json({
        success: true,
        data: result.recordset
      });
    } catch (error) {
      logger.error('Get subdivision tracks error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get tracks'
      });
    }
  }
}

module.exports = new AgencyController();
