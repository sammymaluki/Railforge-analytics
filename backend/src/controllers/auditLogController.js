const { getConnection, sql } = require('../config/database');
const { logger } = require('../config/logger');
const { canAccessAgency } = require('../utils/rbac');
const ExcelJS = require('exceljs');
const {
  getRetentionPolicy,
  updateRetentionPolicy,
  runRetentionCleanup
} = require('../services/auditEventService');

/**
 * Audit Log Controller
 * Handles system audit log queries, filtering, and exports
 */

/**
 * Get audit logs with filtering and pagination
 */
const getAuditLogs = async (req, res) => {
  try {
    const { agencyId } = req.params;
    const {
      startDate,
      endDate,
      actionType,
      tableName,
      userId,
      page = 1,
      limit = 50,
      sortBy = 'Created_Date',
      sortOrder = 'DESC'
    } = req.query;

    // Verify access (users can only view their agency's logs unless admin)
    if (!canAccessAgency(req.user, parseInt(agencyId))) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this agency\'s audit logs'
      });
    }

    const pool = await getConnection();
    const request = pool.request();

    // Build dynamic query
    let whereConditions = ['u.Agency_ID = @AgencyID'];
    request.input('AgencyID', sql.Int, parseInt(agencyId));

    if (startDate) {
      whereConditions.push('sal.Created_Date >= @StartDate');
      request.input('StartDate', sql.DateTime, new Date(`${startDate}T00:00:00.000Z`));
    }

    if (endDate) {
      whereConditions.push('sal.Created_Date <= @EndDate');
      request.input('EndDate', sql.DateTime, new Date(`${endDate}T23:59:59.999Z`));
    }

    if (actionType && actionType !== 'all') {
      whereConditions.push('sal.Action_Type = @ActionType');
      request.input('ActionType', sql.VarChar(50), actionType);
    }

    if (tableName && tableName !== 'all') {
      whereConditions.push('sal.Table_Name = @TableName');
      request.input('TableName', sql.NVarChar(100), tableName);
    }

    if (userId) {
      whereConditions.push('sal.User_ID = @UserID');
      request.input('UserID', sql.Int, parseInt(userId));
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM System_Audit_Logs sal
      INNER JOIN Users u ON sal.User_ID = u.User_ID
      ${whereClause}
    `;

    const countResult = await request.query(countQuery);
    const totalRecords = countResult.recordset[0].total;

    // Get paginated results
    const offset = (page - 1) * limit;
    request.input('Offset', sql.Int, offset);
    request.input('Limit', sql.Int, parseInt(limit));

    // Validate sort column to prevent SQL injection
    const allowedSortColumns = ['Created_Date', 'Action_Type', 'Table_Name', 'Username'];
    const sortColumn = allowedSortColumns.includes(sortBy) ? sortBy : 'Created_Date';
    const sortDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const dataQuery = `
      SELECT 
        sal.Audit_ID,
        sal.User_ID,
        u.Username,
        u.Employee_Name AS Employee_Name_Display,
        u.Email,
        sal.Action_Type,
        sal.Table_Name,
        sal.Record_ID,
        sal.Old_Value,
        sal.New_Value,
        sal.IP_Address,
        sal.Device_Info,
        sal.Created_Date
      FROM System_Audit_Logs sal
      INNER JOIN Users u ON sal.User_ID = u.User_ID
      ${whereClause}
      ORDER BY sal.${sortColumn} ${sortDirection}
      OFFSET @Offset ROWS
      FETCH NEXT @Limit ROWS ONLY
    `;

    const result = await request.query(dataQuery);

    res.json({
      success: true,
      data: {
        logs: result.recordset,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalRecords,
          totalPages: Math.ceil(totalRecords / limit)
        }
      }
    });

  } catch (error) {
    logger.error('Get audit logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve audit logs',
      error: error.message
    });
  }
};

/**
 * Get audit log statistics
 */
const getAuditLogStats = async (req, res) => {
  try {
    const { agencyId } = req.params;
    const { startDate, endDate } = req.query;

    // Verify access
    if (!canAccessAgency(req.user, parseInt(agencyId))) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const pool = await getConnection();
    const request = pool.request();
    request.input('AgencyID', sql.Int, parseInt(agencyId));

    let dateFilter = '';
    if (startDate) {
      request.input('StartDate', sql.DateTime, new Date(`${startDate}T00:00:00.000Z`));
      dateFilter += ' AND sal.Created_Date >= @StartDate';
    }
    if (endDate) {
      request.input('EndDate', sql.DateTime, new Date(`${endDate}T23:59:59.999Z`));
      dateFilter += ' AND sal.Created_Date <= @EndDate';
    }

    const statsQuery = `
      SELECT 
        COUNT(*) as total_logs,
        COUNT(DISTINCT sal.User_ID) as unique_users,
        COUNT(DISTINCT sal.Table_Name) as affected_tables,
        SUM(CASE WHEN sal.Action_Type = 'CREATE' THEN 1 ELSE 0 END) as create_count,
        SUM(CASE WHEN sal.Action_Type = 'UPDATE' THEN 1 ELSE 0 END) as update_count,
        SUM(CASE WHEN sal.Action_Type = 'DELETE' THEN 1 ELSE 0 END) as delete_count,
        SUM(CASE WHEN sal.Action_Type = 'LOGIN' THEN 1 ELSE 0 END) as login_count,
        SUM(CASE WHEN sal.Action_Type = 'LOGOUT' THEN 1 ELSE 0 END) as logout_count,
        SUM(CASE WHEN sal.Created_Date >= DATEADD(DAY, -1, GETDATE()) THEN 1 ELSE 0 END) as last_24h_count,
        SUM(CASE WHEN sal.Created_Date >= DATEADD(DAY, -7, GETDATE()) THEN 1 ELSE 0 END) as last_7d_count
      FROM System_Audit_Logs sal
      INNER JOIN Users u ON sal.User_ID = u.User_ID
      WHERE u.Agency_ID = @AgencyID
      ${dateFilter}
    `;

    const result = await request.query(statsQuery);

    res.json({
      success: true,
      data: result.recordset[0]
    });

  } catch (error) {
    logger.error('Get audit stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve audit statistics',
      error: error.message
    });
  }
};

/**
 * Get available action types
 */
const getActionTypes = async (req, res) => {
  try {
    const { agencyId } = req.params;

    // Verify access
    if (!canAccessAgency(req.user, parseInt(agencyId))) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const pool = await getConnection();
    const request = pool.request();
    request.input('AgencyID', sql.Int, parseInt(agencyId));

    const query = `
      SELECT DISTINCT sal.Action_Type
      FROM System_Audit_Logs sal
      INNER JOIN Users u ON sal.User_ID = u.User_ID
      WHERE u.Agency_ID = @AgencyID
      ORDER BY sal.Action_Type
    `;

    const result = await request.query(query);

    res.json({
      success: true,
      data: result.recordset.map(row => row.Action_Type)
    });

  } catch (error) {
    logger.error('Get action types error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve action types',
      error: error.message
    });
  }
};

/**
 * Get affected tables
 */
const getAffectedTables = async (req, res) => {
  try {
    const { agencyId } = req.params;

    // Verify access
    if (!canAccessAgency(req.user, parseInt(agencyId))) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const pool = await getConnection();
    const request = pool.request();
    request.input('AgencyID', sql.Int, parseInt(agencyId));

    const query = `
      SELECT DISTINCT sal.Table_Name
      FROM System_Audit_Logs sal
      INNER JOIN Users u ON sal.User_ID = u.User_ID
      WHERE u.Agency_ID = @AgencyID
        AND sal.Table_Name IS NOT NULL
      ORDER BY sal.Table_Name
    `;

    const result = await request.query(query);

    res.json({
      success: true,
      data: result.recordset.map(row => row.Table_Name)
    });

  } catch (error) {
    logger.error('Get affected tables error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve affected tables',
      error: error.message
    });
  }
};

/**
 * Export audit logs to Excel
 */
const exportAuditLogs = async (req, res) => {
  try {
    const { agencyId } = req.params;
    const {
      startDate,
      endDate,
      actionType,
      tableName,
      userId
    } = req.query;

    // Verify access
    if (!canAccessAgency(req.user, parseInt(agencyId))) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const pool = await getConnection();
    const request = pool.request();

    // Build query (same as getAuditLogs but without pagination)
    let whereConditions = ['u.Agency_ID = @AgencyID'];
    request.input('AgencyID', sql.Int, parseInt(agencyId));

    if (startDate) {
      whereConditions.push('sal.Created_Date >= @StartDate');
      request.input('StartDate', sql.DateTime, new Date(`${startDate}T00:00:00.000Z`));
    }

    if (endDate) {
      whereConditions.push('sal.Created_Date <= @EndDate');
      request.input('EndDate', sql.DateTime, new Date(`${endDate}T23:59:59.999Z`));
    }

    if (actionType && actionType !== 'all') {
      whereConditions.push('sal.Action_Type = @ActionType');
      request.input('ActionType', sql.VarChar(50), actionType);
    }

    if (tableName && tableName !== 'all') {
      whereConditions.push('sal.Table_Name = @TableName');
      request.input('TableName', sql.NVarChar(100), tableName);
    }

    if (userId) {
      whereConditions.push('sal.User_ID = @UserID');
      request.input('UserID', sql.Int, parseInt(userId));
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const dataQuery = `
      SELECT 
        sal.Audit_ID,
        sal.User_ID,
        u.Username,
        u.Employee_Name AS Employee_Name_Display,
        sal.Action_Type,
        sal.Table_Name,
        sal.Record_ID,
        sal.Old_Value,
        sal.New_Value,
        sal.IP_Address,
        sal.Device_Info,
        sal.Created_Date
      FROM System_Audit_Logs sal
      INNER JOIN Users u ON sal.User_ID = u.User_ID
      ${whereClause}
      ORDER BY sal.Created_Date DESC
    `;

    const result = await request.query(dataQuery);

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Audit Logs');

    // Add headers
    worksheet.columns = [
      { header: 'Audit ID', key: 'Audit_ID', width: 12 },
      { header: 'User ID', key: 'User_ID', width: 10 },
      { header: 'Username', key: 'Username', width: 15 },
      { header: 'Employee Name', key: 'Employee_Name_Display', width: 20 },
      { header: 'Action Type', key: 'Action_Type', width: 15 },
      { header: 'Table Name', key: 'Table_Name', width: 20 },
      { header: 'Record ID', key: 'Record_ID', width: 12 },
      { header: 'Old Value', key: 'Old_Value', width: 30 },
      { header: 'New Value', key: 'New_Value', width: 30 },
      { header: 'IP Address', key: 'IP_Address', width: 15 },
      { header: 'Device Info', key: 'Device_Info', width: 25 },
      { header: 'Created Date', key: 'Created_Date', width: 20 }
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD100' }
    };

    // Add data rows
    result.recordset.forEach(log => {
      worksheet.addRow({
        ...log,
        Created_Date: new Date(log.Created_Date).toISOString()
      });
    });

    // Auto-filter
    worksheet.autoFilter = {
      from: 'A1',
      to: 'L1'
    };

    // Set response headers
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=audit_logs_${new Date().toISOString().split('T')[0]}.xlsx`
    );

    // Write to response
    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    logger.error('Export audit logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export audit logs',
      error: error.message
    });
  }
};

/**
 * Create audit log entry
 * Helper function to be called from other controllers
 */
const createAuditLog = async (userId, actionType, tableName, recordId, oldValue, newValue, ipAddress, deviceInfo) => {
  try {
    const pool = await getConnection();
    const request = pool.request();

    request.input('UserID', sql.Int, userId);
    request.input('ActionType', sql.VarChar(50), actionType);
    request.input('TableName', sql.NVarChar(100), tableName);
    request.input('RecordID', sql.Int, recordId);
    request.input('OldValue', sql.NVarChar(sql.MAX), oldValue ? JSON.stringify(oldValue) : null);
    request.input('NewValue', sql.NVarChar(sql.MAX), newValue ? JSON.stringify(newValue) : null);
    request.input('IPAddress', sql.VarChar(50), ipAddress);
    request.input('DeviceInfo', sql.NVarChar(200), deviceInfo);

    const query = `
      INSERT INTO System_Audit_Logs 
        (User_ID, Action_Type, Table_Name, Record_ID, Old_Value, New_Value, IP_Address, Device_Info, Created_Date)
      VALUES 
        (@UserID, @ActionType, @TableName, @RecordID, @OldValue, @NewValue, @IPAddress, @DeviceInfo, GETDATE())
    `;

    await request.query(query);
    logger.info(`Audit log created: ${actionType} on ${tableName} by user ${userId}`);
  } catch (error) {
    logger.error('Create audit log error:', error);
    // Don't throw - audit logging should not break main operations
  }
};

const getAuditRetentionPolicy = async (req, res) => {
  try {
    const { agencyId } = req.params;
    if (!canAccessAgency(req.user, parseInt(agencyId, 10))) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const policy = await getRetentionPolicy(agencyId);
    if (!policy) {
      return res.status(500).json({
        success: false,
        message: 'Failed to load retention policy'
      });
    }

    res.json({
      success: true,
      data: {
        agencyId: Number(policy.Agency_ID),
        auditLogRetentionDays: Number(policy.Audit_Log_Retention_Days),
        alertLogRetentionDays: Number(policy.Alert_Log_Retention_Days),
        gpsLogRetentionDays: Number(policy.GPS_Log_Retention_Days),
        sessionLogRetentionDays: Number(policy.Session_Log_Retention_Days),
        isEnabled: Boolean(policy.Is_Enabled),
        lastRunDate: policy.Last_Run_Date,
        modifiedDate: policy.Modified_Date,
      },
    });
  } catch (error) {
    logger.error('Get audit retention policy error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve retention policy',
      error: error.message
    });
  }
};

const updateAuditRetentionPolicy = async (req, res) => {
  try {
    const { agencyId } = req.params;

    if (req.user.Role !== 'Administrator') {
      return res.status(403).json({
        success: false,
        message: 'Only administrators can update retention policy'
      });
    }

    const updated = await updateRetentionPolicy(agencyId, req.body || {});
    if (!updated) {
      return res.status(500).json({
        success: false,
        message: 'Failed to update retention policy'
      });
    }

    await createAuditLog(
      req.user.User_ID,
      'RETENTION_POLICY_UPDATE',
      'Audit_Retention_Policies',
      null,
      null,
      {
        agencyId: Number(agencyId),
        auditLogRetentionDays: Number(updated.Audit_Log_Retention_Days),
        alertLogRetentionDays: Number(updated.Alert_Log_Retention_Days),
        gpsLogRetentionDays: Number(updated.GPS_Log_Retention_Days),
        sessionLogRetentionDays: Number(updated.Session_Log_Retention_Days),
        isEnabled: Boolean(updated.Is_Enabled),
      },
      req.ip,
      req.get('User-Agent')
    );

    res.json({
      success: true,
      data: {
        agencyId: Number(updated.Agency_ID),
        auditLogRetentionDays: Number(updated.Audit_Log_Retention_Days),
        alertLogRetentionDays: Number(updated.Alert_Log_Retention_Days),
        gpsLogRetentionDays: Number(updated.GPS_Log_Retention_Days),
        sessionLogRetentionDays: Number(updated.Session_Log_Retention_Days),
        isEnabled: Boolean(updated.Is_Enabled),
        lastRunDate: updated.Last_Run_Date,
        modifiedDate: updated.Modified_Date,
      },
      message: 'Retention policy updated successfully'
    });
  } catch (error) {
    logger.error('Update audit retention policy error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update retention policy',
      error: error.message
    });
  }
};

const runAuditRetention = async (req, res) => {
  try {
    const { agencyId } = req.params;

    if (req.user.Role !== 'Administrator') {
      return res.status(403).json({
        success: false,
        message: 'Only administrators can run retention cleanup'
      });
    }

    const result = await runRetentionCleanup(agencyId);
    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Retention cleanup failed',
        error: result.error || 'Unknown error'
      });
    }

    await createAuditLog(
      req.user.User_ID,
      'RETENTION_CLEANUP_RUN',
      'Audit_Retention_Policies',
      null,
      null,
      {
        agencyId: Number(agencyId),
        skipped: result.skipped,
        deleted: result.deleted,
      },
      req.ip,
      req.get('User-Agent')
    );

    res.json({
      success: true,
      data: result,
      message: result.skipped ? 'Retention cleanup skipped' : 'Retention cleanup completed'
    });
  } catch (error) {
    logger.error('Run audit retention error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to run retention cleanup',
      error: error.message
    });
  }
};

module.exports = {
  getAuditLogs,
  getAuditLogStats,
  getActionTypes,
  getAffectedTables,
  exportAuditLogs,
  createAuditLog,
  getAuditRetentionPolicy,
  updateAuditRetentionPolicy,
  runAuditRetention
};
