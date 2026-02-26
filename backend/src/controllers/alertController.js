const AlertConfiguration = require('../models/AlertConfiguration');
const { logger } = require('../config/logger');
const { getConnection, sql } = require('../config/database');
const { canAccessAgency } = require('../utils/rbac');
const ExcelJS = require('exceljs');

const TRANSIENT_DB_CODES = new Set(['ESOCKET', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT']);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isTransientDbError = (error) => {
  if (!error) return false;
  if (error.code && TRANSIENT_DB_CODES.has(error.code)) return true;
  const msg = String(error.message || '').toLowerCase();
  return (
    msg.includes('connection lost') ||
    msg.includes('econnreset') ||
    msg.includes('failed to connect') ||
    msg.includes('timeout')
  );
};

const runQueryWithRetry = async (requestFactory, query, context, maxRetries = 5) => {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const request = requestFactory();
      return await request.query(query);
    } catch (error) {
      lastError = error;
      if (!isTransientDbError(error) || attempt >= maxRetries) {
        throw error;
      }
      const delay = 200 * (2 ** (attempt - 1));
      logger.warn(`Alert query attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms`, {
        context,
        error: error.message
      });
      // eslint-disable-next-line no-await-in-loop
      await sleep(delay);
    }
  }
  throw lastError;
};

class AlertController {
  async getAlertConfigurations(req, res) {
    try {
      const { agencyId } = req.params;
      const user = req.user;
      
      // Check if user has access to this agency
      if (!canAccessAgency(user, parseInt(agencyId))) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this agency'
        });
      }
      
      const configurations = await AlertConfiguration.getAgencyConfigurations(agencyId);
      
      res.json({
        success: true,
        data: { configurations }
      });
    } catch (error) {
      logger.error('Get alert configurations error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get alert configurations'
      });
    }
  }
  
  async updateAlertConfiguration(req, res) {
    try {
      const { configId } = req.params;
      const updateData = req.body;
      const user = req.user;
      
      // Get current configuration to check agency
      const pool = getConnection();
      const configQuery = `
        SELECT c.*, a.Agency_ID 
        FROM Alert_Configurations c
        INNER JOIN Agencies a ON c.Agency_ID = a.Agency_ID
        WHERE c.Config_ID = @configId
      `;
      
      const configResult = await pool.request()
        .input('configId', sql.Int, configId)
        .query(configQuery);
      
      if (configResult.recordset.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Configuration not found'
        });
      }
      
      const config = configResult.recordset[0];
      
      // Check if user has access to this agency
      if (user.Role !== 'Administrator' && user.Agency_ID !== config.Agency_ID) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this configuration'
        });
      }
      
      const updatedConfig = await AlertConfiguration.updateConfiguration(configId, updateData);
      
      logger.info(`Alert configuration updated: ID ${configId} by user ${user.User_ID}`);
      
      res.json({
        success: true,
        data: { configuration: updatedConfig },
        message: 'Alert configuration updated successfully'
      });
    } catch (error) {
      logger.error('Update alert configuration error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update alert configuration'
      });
    }
  }
  
  async createAlertConfiguration(req, res) {
    try {
      const { agencyId } = req.params;
      const configData = req.body;
      const user = req.user;
      
      // Check if user has access to this agency
      if (!canAccessAgency(user, parseInt(agencyId))) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this agency'
        });
      }
      
      // Add agency ID to config data
      configData.agencyId = parseInt(agencyId);
      
      // Check if configuration already exists
      const pool = getConnection();
      const checkQuery = `
        SELECT 1 
        FROM Alert_Configurations 
        WHERE Agency_ID = @agencyId 
          AND Config_Type = @configType 
          AND Alert_Level = @alertLevel
      `;
      
      const checkResult = await pool.request()
        .input('agencyId', sql.Int, agencyId)
        .input('configType', sql.NVarChar, configData.configType)
        .input('alertLevel', sql.NVarChar, configData.alertLevel)
        .query(checkQuery);
      
      if (checkResult.recordset.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Alert configuration already exists for this type and level'
        });
      }
      
      const configuration = await AlertConfiguration.createConfiguration(configData);
      
      logger.info(`Alert configuration created: ${configData.configType}/${configData.alertLevel} for agency ${agencyId} by user ${user.User_ID}`);
      
      res.status(201).json({
        success: true,
        data: { configuration },
        message: 'Alert configuration created successfully'
      });
    } catch (error) {
      logger.error('Create alert configuration error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create alert configuration'
      });
    }
  }
  
  async getUserAlerts(req, res) {
    try {
      const user = req.user;
      const rawLimit = Number.parseInt(req.query.limit, 10);
      const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 200)) : 50;
      const unreadOnly = req.query.unreadOnly === 'true';
      
      const pool = getConnection();
      
      let query = `
        SELECT TOP ${limit} *
        FROM Alert_Logs
        WHERE User_ID = @userId
      `;
      
      if (unreadOnly) {
        query += ' AND Is_Read = 0';
      }
      
      query += ' ORDER BY Created_Date DESC';
      
      const result = await runQueryWithRetry(
        () => pool.request().input('userId', sql.Int, user.User_ID),
        query,
        'getUserAlerts.list'
      );
      
      // Get unread count
      let unreadCount = 0;
      if (unreadOnly) {
        unreadCount = result.recordset.length;
      } else {
        const unreadResult = await runQueryWithRetry(
          () => pool.request().input('userId', sql.Int, user.User_ID),
          'SELECT COUNT(*) as count FROM Alert_Logs WHERE User_ID = @userId AND Is_Read = 0',
          'getUserAlerts.unreadCount'
        );
        unreadCount = unreadResult.recordset[0].count;
      }
      
      res.json({
        success: true,
        data: {
          alerts: result.recordset,
          count: result.recordset.length,
          unreadCount: unreadCount
        }
      });
    } catch (error) {
      logger.error('Get user alerts error:', error);

      if (String(error.message || '').includes("Invalid object name 'Alert_Logs'")) {
        return res.json({
          success: true,
          data: {
            alerts: [],
            count: 0,
            unreadCount: 0
          }
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to get user alerts',
        ...(process.env.NODE_ENV === 'development' && { details: error.message })
      });
    }
  }
  
  async markAlertAsRead(req, res) {
    try {
      const { alertId } = req.params;
      const user = req.user;
      
      const pool = getConnection();
      
      // Check if alert belongs to user
      const checkQuery = `
        SELECT 1 
        FROM Alert_Logs 
        WHERE Alert_Log_ID = @alertId AND User_ID = @userId
      `;
      
      const checkResult = await pool.request()
        .input('alertId', sql.BigInt, alertId)
        .input('userId', sql.Int, user.User_ID)
        .query(checkQuery);
      
      if (checkResult.recordset.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Alert not found or access denied'
        });
      }
      
      // Mark as read
      const updateQuery = `
        UPDATE Alert_Logs
        SET Is_Read = 1, Read_Time = GETDATE()
        WHERE Alert_Log_ID = @alertId
      `;
      
      await pool.request()
        .input('alertId', sql.BigInt, alertId)
        .query(updateQuery);
      
      res.json({
        success: true,
        message: 'Alert marked as read'
      });
    } catch (error) {
      logger.error('Mark alert as read error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to mark alert as read'
      });
    }
  }

  async deleteAlert(req, res) {
    try {
      const { alertId } = req.params;
      const user = req.user;
      
      const pool = getConnection();
      
      // Check if alert belongs to user
      const checkQuery = `
        SELECT 1 
        FROM Alert_Logs 
        WHERE Alert_Log_ID = @alertId AND User_ID = @userId
      `;
      
      const checkResult = await pool.request()
        .input('alertId', sql.BigInt, alertId)
        .input('userId', sql.Int, user.User_ID)
        .query(checkQuery);
      
      if (checkResult.recordset.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Alert not found or access denied'
        });
      }
      
      // Delete the alert
      const deleteQuery = `
        DELETE FROM Alert_Logs
        WHERE Alert_Log_ID = @alertId
      `;
      
      await pool.request()
        .input('alertId', sql.BigInt, alertId)
        .query(deleteQuery);
      
      logger.info(`Alert ${alertId} deleted by user ${user.User_ID}`);
      
      res.json({
        success: true,
        message: 'Alert deleted successfully'
      });
    } catch (error) {
      logger.error('Delete alert error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete alert'
      });
    }
  }
  
  async getAlertStats(req, res) {
    try {
      const { agencyId } = req.params;
      const { days, startDate, endDate } = req.query;
      const user = req.user;
      
      // Check if user has access to this agency
      if (!canAccessAgency(user, parseInt(agencyId))) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this agency'
        });
      }
      
      const pool = getConnection();
      
      // Build date filter
      let dateFilter = '';
      const params = { agencyId: parseInt(agencyId) };
      
      if (startDate && endDate) {
        dateFilter = 'AND al.Created_Date >= @startDate AND al.Created_Date <= @endDate';
        params.startDate = new Date(startDate + 'T00:00:00.000Z');
        params.endDate = new Date(endDate + 'T23:59:59.999Z');
      } else if (days) {
        dateFilter = 'AND al.Created_Date >= DATEADD(day, -@days, GETDATE())';
        params.days = parseInt(days);
      } else {
        // Default to 7 days
        dateFilter = 'AND al.Created_Date >= DATEADD(day, -7, GETDATE())';
      }
      
      const statsQuery = `
        SELECT 
          al.Alert_Type,
          al.Alert_Level,
          COUNT(*) as count,
          SUM(CASE WHEN al.Is_Delivered = 1 THEN 1 ELSE 0 END) as delivered,
          SUM(CASE WHEN al.Is_Read = 1 THEN 1 ELSE 0 END) as read_count,
          AVG(DATEDIFF(SECOND, al.Created_Date, al.Delivered_Time)) as avg_delivery_time_seconds
        FROM Alert_Logs al
        INNER JOIN Users u ON al.User_ID = u.User_ID
        WHERE u.Agency_ID = @agencyId
          ${dateFilter}
        GROUP BY al.Alert_Type, al.Alert_Level
        ORDER BY count DESC
      `;
      
      const statsRequest = pool.request();
      Object.keys(params).forEach(key => {
        statsRequest.input(key, params[key]);
      });
      const statsResult = await statsRequest.query(statsQuery);
      
      // Get alert trend by day
      const trendQuery = `
        SELECT 
          CONVERT(DATE, al.Created_Date) as alert_date,
          al.Alert_Type,
          COUNT(*) as count
        FROM Alert_Logs al
        INNER JOIN Users u ON al.User_ID = u.User_ID
        WHERE u.Agency_ID = @agencyId
          ${dateFilter}
        GROUP BY CONVERT(DATE, al.Created_Date), al.Alert_Type
        ORDER BY alert_date DESC
      `;
      
      const trendRequest = pool.request();
      Object.keys(params).forEach(key => {
        trendRequest.input(key, params[key]);
      });
      const trendResult = await trendRequest.query(trendQuery);
      
      res.json({
        success: true,
        data: {
          summary: statsResult.recordset,
          trend: trendResult.recordset,
          timeframe: `${days} days`
        }
      });
    } catch (error) {
      logger.error('Get alert stats error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get alert statistics'
      });
    }
  }

  async getAlertHistory(req, res) {
    try {
      const { agencyId } = req.params;
      const user = req.user;
      const { 
        startDate, 
        endDate, 
        alertType = 'all', 
        alertLevel = 'all', 
        userId,
        page = 1, 
        limit = 50 
      } = req.query;
      
      // Check if user has access to this agency
      if (!canAccessAgency(user, parseInt(agencyId))) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this agency'
        });
      }
      
      const pool = getConnection();
      
      let whereConditions = ['u.Agency_ID = @agencyId'];
      const params = {
        agencyId: parseInt(agencyId),
        offset: (parseInt(page) - 1) * parseInt(limit),
        limit: parseInt(limit)
      };
      
      if (startDate) {
        whereConditions.push('al.Created_Date >= @startDate');
        params.startDate = new Date(startDate);
      }
      
      if (endDate) {
        whereConditions.push('al.Created_Date <= @endDate');
        params.endDate = new Date(endDate);
      }
      
      if (alertType && alertType !== 'all') {
        whereConditions.push('al.Alert_Type = @alertType');
        params.alertType = alertType;
      }
      
      if (alertLevel && alertLevel !== 'all') {
        whereConditions.push('al.Alert_Level = @alertLevel');
        params.alertLevel = alertLevel;
      }
      
      if (userId) {
        whereConditions.push('al.User_ID = @userId');
        params.userId = parseInt(userId);
      }
      
      // Adjust dates to include full day range
      if (params.startDate) {
        params.startDate = new Date(startDate + 'T00:00:00.000Z');
      }
      if (params.endDate) {
        params.endDate = new Date(endDate + 'T23:59:59.999Z');
      }
      
      const whereClause = whereConditions.join(' AND ');
      
      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM Alert_Logs al
        INNER JOIN Users u ON al.User_ID = u.User_ID
        WHERE ${whereClause}
      `;
      
      const countRequest = pool.request();
      Object.keys(params).forEach(key => {
        if (key !== 'offset' && key !== 'limit') {
          countRequest.input(key, params[key]);
        }
      });
      const countResult = await countRequest.query(countQuery);
      const total = countResult.recordset[0].total;
      
      // Get paginated alerts
      const query = `
        SELECT 
          al.*,
          u.Username,
          u.Employee_Name,
          u.Email
        FROM Alert_Logs al
        INNER JOIN Users u ON al.User_ID = u.User_ID
        WHERE ${whereClause}
        ORDER BY al.Created_Date DESC
        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY
      `;
      
      const request = pool.request();
      Object.keys(params).forEach(key => {
        request.input(key, params[key]);
      });
      const result = await request.query(query);
      
      res.json({
        success: true,
        data: {
          alerts: result.recordset,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPages: Math.ceil(total / parseInt(limit))
          }
        }
      });
    } catch (error) {
      logger.error('Get alert history error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get alert history'
      });
    }
  }
  
  async exportAlertHistory(req, res) {
    try {
      const { agencyId } = req.params;
      const user = req.user;
      const { 
        startDate, 
        endDate, 
        alertType = 'all', 
        alertLevel = 'all', 
        userId
      } = req.query;
      
      // Check if user has access to this agency
      if (!canAccessAgency(user, parseInt(agencyId))) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this agency'
        });
      }
      
      const pool = getConnection();
      
      let whereConditions = ['u.Agency_ID = @agencyId'];
      const params = {
        agencyId: parseInt(agencyId)
      };
      
      if (startDate) {
        whereConditions.push('al.Created_Date >= @startDate');
        params.startDate = new Date(startDate + 'T00:00:00.000Z');
      }
      
      if (endDate) {
        whereConditions.push('al.Created_Date <= @endDate');
        params.endDate = new Date(endDate + 'T23:59:59.999Z');
      }
      
      if (alertType && alertType !== 'all') {
        whereConditions.push('al.Alert_Type = @alertType');
        params.alertType = alertType;
      }
      
      if (alertLevel && alertLevel !== 'all') {
        whereConditions.push('al.Alert_Level = @alertLevel');
        params.alertLevel = alertLevel;
      }
      
      if (userId) {
        whereConditions.push('al.User_ID = @userId');
        params.userId = parseInt(userId);
      }
      
      const whereClause = whereConditions.join(' AND ');
      
      // Get all alerts (no pagination for export)
      const query = `
        SELECT 
          al.*,
          u.Username,
          u.Employee_Name,
          u.Email,
          CONCAT(a.Track_Type, ' ', a.Track_Number, ': MP ', a.Begin_MP, ' - ', a.End_MP) as Authority_Description,
          s.Subdivision_Name
        FROM Alert_Logs al
        INNER JOIN Users u ON al.User_ID = u.User_ID
        INNER JOIN Authorities a ON al.Authority_ID = a.Authority_ID
        INNER JOIN Subdivisions s ON a.Subdivision_ID = s.Subdivision_ID
        WHERE ${whereClause}
        ORDER BY al.Created_Date DESC
      `;
      
      const request = pool.request();
      Object.keys(params).forEach(key => {
        request.input(key, params[key]);
      });
      const result = await request.query(query);
      
      // Create Excel workbook
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Alert History');
      
      // Add headers
      worksheet.columns = [
        { header: 'Alert ID', key: 'Alert_Log_ID', width: 12 },
        { header: 'Date/Time', key: 'Created_Date', width: 20 },
        { header: 'User', key: 'Username', width: 15 },
        { header: 'Employee Name', key: 'Employee_Name', width: 20 },
        { header: 'Subdivision', key: 'Subdivision_Name', width: 20 },
        { header: 'Authority', key: 'Authority_Description', width: 30 },
        { header: 'Alert Type', key: 'Alert_Type', width: 20 },
        { header: 'Alert Level', key: 'Alert_Level', width: 12 },
        { header: 'Distance (m)', key: 'Triggered_Distance', width: 12 },
        { header: 'Message', key: 'Message', width: 40 },
        { header: 'Read', key: 'Is_Read', width: 8 }
      ];
      
      // Style header row
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD100' }
      };
      
      // Add data rows
      result.recordset.forEach(alert => {
        worksheet.addRow({
          ...alert,
          Created_Date: new Date(alert.Created_Date).toISOString(),
          Is_Read: alert.Is_Read ? 'Yes' : 'No'
        });
      });
      
      // Auto-filter
      worksheet.autoFilter = {
        from: 'A1',
        to: 'K1'
      };
      
      // Set response headers
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=alert_history_${new Date().toISOString().split('T')[0]}.xlsx`
      );
      
      // Write to response
      await workbook.xlsx.write(res);
      res.end();
      
    } catch (error) {
      logger.error('Export alert history error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to export alert history'
      });
    }
  }
  
  async getUnreadCount(userId) {
    const pool = getConnection();
    
    const query = `
      SELECT COUNT(*) as unread_count
      FROM Alert_Logs
      WHERE User_ID = @userId AND Is_Read = 0
    `;
    
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query(query);
    
    return result.recordset[0].unread_count;
  }
}

module.exports = new AlertController();
