const crypto = require('crypto');
const { getConnection, sql } = require('../config/database');
const { logger } = require('../config/logger');

let retentionSchemaInitPromise = null;

const ensureAuditRetentionSchema = async () => {
  if (retentionSchemaInitPromise) {
    return retentionSchemaInitPromise;
  }

  retentionSchemaInitPromise = (async () => {
    const pool = await getConnection();
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'User_Sessions')
      BEGIN
        CREATE TABLE User_Sessions (
          Session_ID NVARCHAR(64) PRIMARY KEY,
          User_ID INT NOT NULL FOREIGN KEY REFERENCES Users(User_ID),
          Agency_ID INT NULL FOREIGN KEY REFERENCES Agencies(Agency_ID),
          Login_Time DATETIME NOT NULL DEFAULT GETDATE(),
          Last_Seen_Time DATETIME NOT NULL DEFAULT GETDATE(),
          Logout_Time DATETIME NULL,
          Session_Status NVARCHAR(20) NOT NULL DEFAULT 'Active',
          IP_Address VARCHAR(50) NULL,
          Device_Info NVARCHAR(200) NULL,
          Token_Hash NVARCHAR(128) NULL,
          Created_Date DATETIME NOT NULL DEFAULT GETDATE()
        );
      END;

      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Audit_Retention_Policies')
      BEGIN
        CREATE TABLE Audit_Retention_Policies (
          Policy_ID INT IDENTITY(1,1) PRIMARY KEY,
          Agency_ID INT NOT NULL UNIQUE FOREIGN KEY REFERENCES Agencies(Agency_ID),
          Audit_Log_Retention_Days INT NOT NULL DEFAULT 365,
          Alert_Log_Retention_Days INT NOT NULL DEFAULT 180,
          GPS_Log_Retention_Days INT NOT NULL DEFAULT 90,
          Session_Log_Retention_Days INT NOT NULL DEFAULT 90,
          Is_Enabled BIT NOT NULL DEFAULT 1,
          Last_Run_Date DATETIME NULL,
          Created_Date DATETIME NOT NULL DEFAULT GETDATE(),
          Modified_Date DATETIME NOT NULL DEFAULT GETDATE()
        );
      END;

      IF NOT EXISTS (
        SELECT * FROM sys.indexes
        WHERE name = 'IX_User_Sessions_User'
          AND object_id = OBJECT_ID('User_Sessions')
      )
      BEGIN
        CREATE INDEX IX_User_Sessions_User ON User_Sessions(User_ID, Login_Time DESC);
      END;

      IF NOT EXISTS (
        SELECT * FROM sys.indexes
        WHERE name = 'IX_User_Sessions_Agency'
          AND object_id = OBJECT_ID('User_Sessions')
      )
      BEGIN
        CREATE INDEX IX_User_Sessions_Agency ON User_Sessions(Agency_ID, Login_Time DESC);
      END;

      IF NOT EXISTS (
        SELECT * FROM sys.indexes
        WHERE name = 'IX_Audit_Retention_Policies_Agency'
          AND object_id = OBJECT_ID('Audit_Retention_Policies')
      )
      BEGIN
        CREATE INDEX IX_Audit_Retention_Policies_Agency ON Audit_Retention_Policies(Agency_ID);
      END;
    `);
  })().catch((error) => {
    retentionSchemaInitPromise = null;
    throw error;
  });

  return retentionSchemaInitPromise;
};

const safeJson = (value) => {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return JSON.stringify({ note: 'serialization_failed' });
  }
};

const logAuditEvent = async ({
  userId,
  actionType,
  tableName = null,
  recordId = null,
  oldValue = null,
  newValue = null,
  ipAddress = null,
  deviceInfo = null
}) => {
  try {
    if (!Number.isFinite(Number(userId))) return;
    const pool = await getConnection();
    const request = pool.request();

    request.input('UserID', sql.Int, Number(userId));
    request.input('ActionType', sql.VarChar(50), String(actionType || 'UNKNOWN'));
    request.input('TableName', sql.NVarChar(100), tableName ? String(tableName) : null);
    request.input('RecordID', sql.Int, Number.isFinite(Number(recordId)) ? Number(recordId) : null);
    request.input('OldValue', sql.NVarChar(sql.MAX), safeJson(oldValue));
    request.input('NewValue', sql.NVarChar(sql.MAX), safeJson(newValue));
    request.input('IPAddress', sql.VarChar(50), ipAddress ? String(ipAddress) : null);
    request.input('DeviceInfo', sql.NVarChar(200), deviceInfo ? String(deviceInfo).slice(0, 200) : null);

    await request.query(`
      INSERT INTO System_Audit_Logs
        (User_ID, Action_Type, Table_Name, Record_ID, Old_Value, New_Value, IP_Address, Device_Info, Created_Date)
      VALUES
        (@UserID, @ActionType, @TableName, @RecordID, @OldValue, @NewValue, @IPAddress, @DeviceInfo, GETDATE())
    `);
  } catch (error) {
    logger.error('Failed to log audit event:', error);
  }
};

const hashToken = (token) => {
  if (!token) return null;
  return crypto.createHash('sha256').update(String(token)).digest('hex');
};

const startUserSession = async ({
  sessionId,
  userId,
  agencyId,
  ipAddress = null,
  deviceInfo = null,
  token = null
}) => {
  try {
    await ensureAuditRetentionSchema();
    if (!sessionId || !Number.isFinite(Number(userId))) return;
    const pool = await getConnection();
    const request = pool.request();
    request.input('SessionID', sql.NVarChar(64), String(sessionId));
    request.input('UserID', sql.Int, Number(userId));
    request.input('AgencyID', sql.Int, Number.isFinite(Number(agencyId)) ? Number(agencyId) : null);
    request.input('IPAddress', sql.VarChar(50), ipAddress ? String(ipAddress) : null);
    request.input('DeviceInfo', sql.NVarChar(200), deviceInfo ? String(deviceInfo).slice(0, 200) : null);
    request.input('TokenHash', sql.NVarChar(128), hashToken(token));

    await request.query(`
      INSERT INTO User_Sessions (
        Session_ID, User_ID, Agency_ID, Login_Time, Last_Seen_Time, Logout_Time,
        Session_Status, IP_Address, Device_Info, Token_Hash
      )
      VALUES (
        @SessionID, @UserID, @AgencyID, GETDATE(), GETDATE(), NULL,
        'Active', @IPAddress, @DeviceInfo, @TokenHash
      )
    `);
  } catch (error) {
    logger.error('Failed to start user session:', error);
  }
};

const endUserSession = async ({
  sessionId = null,
  userId = null
}) => {
  try {
    await ensureAuditRetentionSchema();
    const pool = await getConnection();
    const request = pool.request();

    if (sessionId) {
      request.input('SessionID', sql.NVarChar(64), String(sessionId));
      await request.query(`
        UPDATE User_Sessions
        SET Logout_Time = GETDATE(),
            Last_Seen_Time = GETDATE(),
            Session_Status = 'Ended'
        WHERE Session_ID = @SessionID
          AND Session_Status = 'Active'
      `);
      return;
    }

    if (Number.isFinite(Number(userId))) {
      request.input('UserID', sql.Int, Number(userId));
      await request.query(`
        UPDATE User_Sessions
        SET Logout_Time = GETDATE(),
            Last_Seen_Time = GETDATE(),
            Session_Status = 'Ended'
        WHERE User_ID = @UserID
          AND Session_Status = 'Active'
      `);
    }
  } catch (error) {
    logger.error('Failed to end user session:', error);
  }
};

const getRetentionPolicy = async (agencyId) => {
  try {
    await ensureAuditRetentionSchema();
    if (!Number.isFinite(Number(agencyId))) return null;

    const pool = await getConnection();
    const request = pool.request();
    request.input('AgencyID', sql.Int, Number(agencyId));

    const result = await request.query(`
      SELECT TOP 1
        Agency_ID,
        Audit_Log_Retention_Days,
        Alert_Log_Retention_Days,
        GPS_Log_Retention_Days,
        Session_Log_Retention_Days,
        Is_Enabled,
        Last_Run_Date,
        Created_Date,
        Modified_Date
      FROM Audit_Retention_Policies
      WHERE Agency_ID = @AgencyID
    `);

    if (result.recordset.length > 0) {
      return result.recordset[0];
    }

    await request.query(`
      INSERT INTO Audit_Retention_Policies (
        Agency_ID,
        Audit_Log_Retention_Days,
        Alert_Log_Retention_Days,
        GPS_Log_Retention_Days,
        Session_Log_Retention_Days,
        Is_Enabled,
        Created_Date,
        Modified_Date
      )
      VALUES (
        @AgencyID,
        365,
        180,
        90,
        90,
        1,
        GETDATE(),
        GETDATE()
      )
    `);

    const created = await request.query(`
      SELECT TOP 1
        Agency_ID,
        Audit_Log_Retention_Days,
        Alert_Log_Retention_Days,
        GPS_Log_Retention_Days,
        Session_Log_Retention_Days,
        Is_Enabled,
        Last_Run_Date,
        Created_Date,
        Modified_Date
      FROM Audit_Retention_Policies
      WHERE Agency_ID = @AgencyID
    `);

    return created.recordset[0] || null;
  } catch (error) {
    logger.error('Failed to get retention policy:', error);
    return null;
  }
};

const updateRetentionPolicy = async (agencyId, policy = {}) => {
  try {
    await ensureAuditRetentionSchema();
    const parsedAgencyId = Number(agencyId);
    if (!Number.isFinite(parsedAgencyId)) return null;

    const currentPolicy = await getRetentionPolicy(parsedAgencyId);
    if (!currentPolicy) return null;

    const normalizeDays = (value, fallback) => {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed)) return fallback;
      return Math.max(1, Math.min(3650, parsed));
    };

    const nextPolicy = {
      auditLogRetentionDays: normalizeDays(policy.auditLogRetentionDays, currentPolicy.Audit_Log_Retention_Days),
      alertLogRetentionDays: normalizeDays(policy.alertLogRetentionDays, currentPolicy.Alert_Log_Retention_Days),
      gpsLogRetentionDays: normalizeDays(policy.gpsLogRetentionDays, currentPolicy.GPS_Log_Retention_Days),
      sessionLogRetentionDays: normalizeDays(policy.sessionLogRetentionDays, currentPolicy.Session_Log_Retention_Days),
      isEnabled: policy.isEnabled === undefined ? Boolean(currentPolicy.Is_Enabled) : Boolean(policy.isEnabled),
    };

    const pool = await getConnection();
    const request = pool.request();
    request.input('AgencyID', sql.Int, parsedAgencyId);
    request.input('AuditDays', sql.Int, nextPolicy.auditLogRetentionDays);
    request.input('AlertDays', sql.Int, nextPolicy.alertLogRetentionDays);
    request.input('GPSDays', sql.Int, nextPolicy.gpsLogRetentionDays);
    request.input('SessionDays', sql.Int, nextPolicy.sessionLogRetentionDays);
    request.input('IsEnabled', sql.Bit, nextPolicy.isEnabled ? 1 : 0);

    await request.query(`
      UPDATE Audit_Retention_Policies
      SET
        Audit_Log_Retention_Days = @AuditDays,
        Alert_Log_Retention_Days = @AlertDays,
        GPS_Log_Retention_Days = @GPSDays,
        Session_Log_Retention_Days = @SessionDays,
        Is_Enabled = @IsEnabled,
        Modified_Date = GETDATE()
      WHERE Agency_ID = @AgencyID
    `);

    return getRetentionPolicy(parsedAgencyId);
  } catch (error) {
    logger.error('Failed to update retention policy:', error);
    return null;
  }
};

const runRetentionCleanup = async (agencyId) => {
  try {
    await ensureAuditRetentionSchema();
    const policy = await getRetentionPolicy(agencyId);
    if (!policy || !policy.Is_Enabled) {
      return {
        success: true,
        skipped: true,
        reason: 'Retention policy is disabled',
        deleted: {
          auditLogs: 0,
          alertLogs: 0,
          gpsLogs: 0,
          sessions: 0,
        },
      };
    }

    const pool = await getConnection();
    const request = pool.request();
    request.input('AgencyID', sql.Int, Number(agencyId));
    request.input('AuditDays', sql.Int, Number(policy.Audit_Log_Retention_Days));
    request.input('AlertDays', sql.Int, Number(policy.Alert_Log_Retention_Days));
    request.input('GPSDays', sql.Int, Number(policy.GPS_Log_Retention_Days));
    request.input('SessionDays', sql.Int, Number(policy.Session_Log_Retention_Days));

    const result = await request.query(`
      DECLARE @auditDeleted INT = 0;
      DECLARE @alertDeleted INT = 0;
      DECLARE @gpsDeleted INT = 0;
      DECLARE @sessionDeleted INT = 0;

      DELETE sal
      FROM System_Audit_Logs sal
      INNER JOIN Users u ON u.User_ID = sal.User_ID
      WHERE u.Agency_ID = @AgencyID
        AND sal.Created_Date < DATEADD(DAY, -@AuditDays, GETDATE());
      SET @auditDeleted = @@ROWCOUNT;

      DELETE al
      FROM Alert_Logs al
      INNER JOIN Users u ON u.User_ID = al.User_ID
      WHERE u.Agency_ID = @AgencyID
        AND al.Created_Date < DATEADD(DAY, -@AlertDays, GETDATE());
      SET @alertDeleted = @@ROWCOUNT;

      DELETE gl
      FROM GPS_Logs gl
      INNER JOIN Users u ON u.User_ID = gl.User_ID
      WHERE u.Agency_ID = @AgencyID
        AND gl.Created_Date < DATEADD(DAY, -@GPSDays, GETDATE());
      SET @gpsDeleted = @@ROWCOUNT;

      DELETE us
      FROM User_Sessions us
      WHERE us.Agency_ID = @AgencyID
        AND us.Login_Time < DATEADD(DAY, -@SessionDays, GETDATE());
      SET @sessionDeleted = @@ROWCOUNT;

      UPDATE Audit_Retention_Policies
      SET Last_Run_Date = GETDATE(),
          Modified_Date = GETDATE()
      WHERE Agency_ID = @AgencyID;

      SELECT
        @auditDeleted AS auditLogs,
        @alertDeleted AS alertLogs,
        @gpsDeleted AS gpsLogs,
        @sessionDeleted AS sessions;
    `);

    return {
      success: true,
      skipped: false,
      deleted: result.recordset[0] || {
        auditLogs: 0,
        alertLogs: 0,
        gpsLogs: 0,
        sessions: 0,
      },
    };
  } catch (error) {
    logger.error('Failed to run retention cleanup:', error);
    return {
      success: false,
      skipped: false,
      error: error.message,
      deleted: {
        auditLogs: 0,
        alertLogs: 0,
        gpsLogs: 0,
        sessions: 0,
      },
    };
  }
};

module.exports = {
  logAuditEvent,
  startUserSession,
  endUserSession,
  getRetentionPolicy,
  updateRetentionPolicy,
  runRetentionCleanup
};
