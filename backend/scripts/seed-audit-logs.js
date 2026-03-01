require('dotenv').config();
const sql = require('mssql');

// Database configuration
const sqlConfig = {
  server: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'HerzogRailAuthority',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'Herzog2024!',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 1434,
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
    connectTimeout: 15000,
    requestTimeout: 15000
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

async function seedAuditLogs() {
  let pool;
  
  try {
    console.log('Seeding audit logs...\n');
    
    pool = await sql.connect(sqlConfig);
    console.log('Connected to SQL Server successfully');

    // Sample audit log entries
    const auditLogs = [
      // User actions
      {
        userId: 1,
        actionType: 'CREATE',
        tableName: 'Users',
        recordId: 3,
        oldValue: null,
        newValue: JSON.stringify({ username: 'supervisor1', role: 'Supervisor', agencyId: 1 }),
        ipAddress: '192.168.1.100',
        deviceInfo: 'Chrome 120.0 - Windows 10'
      },
      {
        userId: 1,
        actionType: 'UPDATE',
        tableName: 'Users',
        recordId: 3,
        oldValue: JSON.stringify({ Is_Active: false }),
        newValue: JSON.stringify({ Is_Active: true }),
        ipAddress: '192.168.1.100',
        deviceInfo: 'Chrome 120.0 - Windows 10'
      },
      // Authority actions
      {
        userId: 1,
        actionType: 'CREATE',
        tableName: 'Authorities',
        recordId: 1,
        oldValue: null,
        newValue: JSON.stringify({ Authority_Type: 'Track_Authority', Begin_MP: 100, End_MP: 120 }),
        ipAddress: '192.168.1.100',
        deviceInfo: 'Chrome 120.0 - Windows 10'
      },
      {
        userId: 1,
        actionType: 'UPDATE',
        tableName: 'Authorities',
        recordId: 1,
        oldValue: JSON.stringify({ Is_Active: true }),
        newValue: JSON.stringify({ Is_Active: false }),
        ipAddress: '192.168.1.100',
        deviceInfo: 'Chrome 120.0 - Windows 10'
      },
      {
        userId: 1,
        actionType: 'DELETE',
        tableName: 'Authorities',
        recordId: 5,
        oldValue: JSON.stringify({ Authority_ID: 5, Authority_Type: 'Lone_Worker_Authority' }),
        newValue: null,
        ipAddress: '192.168.1.100',
        deviceInfo: 'Chrome 120.0 - Windows 10'
      },
      // Alert configuration actions
      {
        userId: 1,
        actionType: 'UPDATE',
        tableName: 'Alert_Configurations',
        recordId: 1,
        oldValue: JSON.stringify({ Distance_Miles: 0.5 }),
        newValue: JSON.stringify({ Distance_Miles: 0.75 }),
        ipAddress: '192.168.1.105',
        deviceInfo: 'Firefox 121.0 - Windows 10'
      },
      {
        userId: 1,
        actionType: 'CREATE',
        tableName: 'Alert_Configurations',
        recordId: 9,
        oldValue: null,
        newValue: JSON.stringify({ Config_Type: 'Time_Alert', Alert_Level: 'Warning' }),
        ipAddress: '192.168.1.105',
        deviceInfo: 'Firefox 121.0 - Windows 10'
      },
      // Pin type actions
      {
        userId: 1,
        actionType: 'CREATE',
        tableName: 'Pin_Types',
        recordId: 13,
        oldValue: null,
        newValue: JSON.stringify({ Pin_Category: 'Emergency', Pin_Subtype: 'Medical', Color: '#FF0000' }),
        ipAddress: '192.168.1.110',
        deviceInfo: 'Edge 120.0 - Windows 11'
      },
      {
        userId: 1,
        actionType: 'UPDATE',
        tableName: 'Pin_Types',
        recordId: 1,
        oldValue: JSON.stringify({ Is_Active: false }),
        newValue: JSON.stringify({ Is_Active: true }),
        ipAddress: '192.168.1.110',
        deviceInfo: 'Edge 120.0 - Windows 11'
      },
      // Agency actions
      {
        userId: 1,
        actionType: 'UPDATE',
        tableName: 'Agencies',
        recordId: 1,
        oldValue: JSON.stringify({ Agency_Name: 'DEFAULT' }),
        newValue: JSON.stringify({ Agency_Name: 'DEFAULT AGENCY' }),
        ipAddress: '192.168.1.100',
        deviceInfo: 'Chrome 120.0 - Windows 10'
      },
      // Login attempts
      {
        userId: 1,
        actionType: 'LOGIN',
        tableName: 'Users',
        recordId: 2,
        oldValue: null,
        newValue: JSON.stringify({ username: 'admin', success: true }),
        ipAddress: '192.168.1.100',
        deviceInfo: 'Chrome 120.0 - Windows 10'
      },
      {
        userId: null,
        actionType: 'LOGIN_FAILED',
        tableName: 'Users',
        recordId: null,
        oldValue: null,
        newValue: JSON.stringify({ username: 'unknown', reason: 'Invalid credentials' }),
        ipAddress: '192.168.1.150',
        deviceInfo: 'Chrome 120.0 - Windows 10'
      },
      // Authority overlap resolution
      {
        userId: 1,
        actionType: 'UPDATE',
        tableName: 'Authority_Overlaps',
        recordId: 1,
        oldValue: JSON.stringify({ Is_Resolved: false }),
        newValue: JSON.stringify({ Is_Resolved: true, Resolved_By: 2 }),
        ipAddress: '192.168.1.100',
        deviceInfo: 'Chrome 120.0 - Windows 10'
      },
      // Settings changes
      {
        userId: 1,
        actionType: 'UPDATE',
        tableName: 'System_Settings',
        recordId: 1,
        oldValue: JSON.stringify({ Setting_Key: 'max_authority_duration', Setting_Value: '8' }),
        newValue: JSON.stringify({ Setting_Key: 'max_authority_duration', Setting_Value: '12' }),
        ipAddress: '192.168.1.105',
        deviceInfo: 'Firefox 121.0 - Windows 10'
      },
      // Bulk operations
      {
        userId: 1,
        actionType: 'BULK_UPDATE',
        tableName: 'Alert_Configurations',
        recordId: null,
        oldValue: null,
        newValue: JSON.stringify({ affected_records: 5, operation: 'distance_threshold_update' }),
        ipAddress: '192.168.1.100',
        deviceInfo: 'Chrome 120.0 - Windows 10'
      }
    ];

    let created = 0;
    for (const log of auditLogs) {
      const daysAgo = Math.floor(Math.random() * 30); // Random date within last 30 days
      const createdDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

      await pool.request()
        .input('userId', sql.Int, log.userId)
        .input('actionType', sql.NVarChar, log.actionType)
        .input('tableName', sql.NVarChar, log.tableName)
        .input('recordId', sql.Int, log.recordId)
        .input('oldValue', sql.NVarChar, log.oldValue)
        .input('newValue', sql.NVarChar, log.newValue)
        .input('ipAddress', sql.NVarChar, log.ipAddress)
        .input('deviceInfo', sql.NVarChar, log.deviceInfo)
        .input('createdDate', sql.DateTime, createdDate)
        .query(`
          INSERT INTO System_Audit_Logs (
            User_ID, Action_Type, Table_Name, Record_ID,
            Old_Value, New_Value, IP_Address, Device_Info, Created_Date
          )
          VALUES (
            @userId, @actionType, @tableName, @recordId,
            @oldValue, @newValue, @ipAddress, @deviceInfo, @createdDate
          )
        `);
      created++;
    }

    console.log(`\n✅ Created ${created} audit log entries`);
    console.log('\n📊 Audit Log Summary:');
    console.log('   CREATE actions: 5');
    console.log('   UPDATE actions: 7');
    console.log('   DELETE actions: 1');
    console.log('   LOGIN actions: 2');
    console.log('   BULK operations: 1');

  } catch (error) {
    console.error('❌ Error seeding audit logs:', error.message);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.close();
      console.log('Database connection closed');
    }
    console.log('\n✅ Done!');
  }
}

seedAuditLogs();
