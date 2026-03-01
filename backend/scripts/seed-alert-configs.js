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

async function seedAlertConfigs() {
  let pool;
  
  try {
    console.log('Seeding alert configurations...\n');
    
    pool = await sql.connect(sqlConfig);
    console.log('Connected to SQL Server successfully');

    // Default alert configurations for agency 1 (DEFAULT)
    const alertConfigs = [
      // Proximity Alerts
      {
        agencyId: 1,
        configType: 'Proximity_Alert',
        alertLevel: 'Informational',
        distanceMiles: 1.0,
        timeMinutes: 5,
        description: 'Informational alert when workers are detected within 1 mile radius',
        messageTemplate: 'Worker detected within 1 mile',
        isActive: true
      },
      {
        agencyId: 1,
        configType: 'Proximity_Alert',
        alertLevel: 'Warning',
        distanceMiles: 0.5,
        timeMinutes: 3,
        description: 'Warning alert when workers approach within 0.5 miles - exercise caution',
        messageTemplate: 'Worker detected within 0.5 miles - exercise caution',
        isActive: true
      },
      {
        agencyId: 1,
        configType: 'Proximity_Alert',
        alertLevel: 'Critical',
        distanceMiles: 0.25,
        timeMinutes: 1,
        description: 'Critical alert requiring immediate action when workers are within 0.25 miles',
        messageTemplate: 'CRITICAL: Worker detected within 0.25 miles - immediate action required',
        isActive: true
      },
      // Boundary Alerts
      {
        agencyId: 1,
        configType: 'Boundary_Alert',
        alertLevel: 'Informational',
        distanceMiles: 1.0,
        timeMinutes: 5,
        description: 'Informational alert for authority boundary approaching at 1 mile',
        messageTemplate: 'Approaching authority boundary (1 mile)',
        isActive: true
      },
      {
        agencyId: 1,
        configType: 'Boundary_Alert',
        alertLevel: 'Warning',
        distanceMiles: 0.5,
        timeMinutes: 2,
        description: 'Warning alert as authority boundary approaches within 0.5 miles',
        messageTemplate: 'WARNING: Approaching authority boundary (0.5 miles)',
        isActive: true
      },
      {
        agencyId: 1,
        configType: 'Boundary_Alert',
        alertLevel: 'Critical',
        distanceMiles: 0.25,
        timeMinutes: 1,
        description: 'Critical alert when authority boundary exit is imminent at 0.25 miles',
        messageTemplate: 'CRITICAL: Authority boundary exit imminent (0.25 miles)',
        isActive: true
      },
      // Overlap Alerts
      {
        agencyId: 1,
        configType: 'Overlap_Alert',
        alertLevel: 'Warning',
        distanceMiles: 0,
        timeMinutes: 5,
        description: 'Warning alert when authority overlap is detected',
        messageTemplate: 'Authority overlap detected',
        isActive: true
      },
      {
        agencyId: 1,
        configType: 'Overlap_Alert',
        alertLevel: 'Critical',
        distanceMiles: 0,
        timeMinutes: 2,
        description: 'Critical alert for severe authority overlap requiring immediate coordination',
        messageTemplate: 'CRITICAL: Severe authority overlap detected - immediate coordination required',
        isActive: true
      }
    ];

    let created = 0;
    for (const config of alertConfigs) {
      await pool.request()
        .input('agencyId', sql.Int, config.agencyId)
        .input('configType', sql.NVarChar, config.configType)
        .input('alertLevel', sql.NVarChar, config.alertLevel)
        .input('distanceMiles', sql.Decimal(5, 2), config.distanceMiles)
        .input('messageTemplate', sql.NVarChar, config.messageTemplate)
        .input('timeMinutes', sql.Int, config.timeMinutes)
        .input('description', sql.NVarChar, config.description)
        .input('isActive', sql.Bit, config.isActive ? 1 : 0)
        .query(`
          IF NOT EXISTS (
            SELECT 1 FROM Alert_Configurations 
            WHERE Agency_ID = @agencyId AND Config_Type = @configType 
              AND Alert_Level = @alertLevel AND Distance_Miles = @distanceMiles
          )
          BEGIN
            INSERT INTO Alert_Configurations (
              Agency_ID, Config_Type, Alert_Level, Distance_Miles,
              Message_Template, Time_Minutes, Description, Is_Active
            )
            VALUES (
              @agencyId, @configType, @alertLevel, @distanceMiles,
              @messageTemplate, @timeMinutes, @description, @isActive
            )
          END
        `);
      created++;
    }

    console.log(`\n✅ Created ${created} alert configurations`);
    console.log('\n📊 Alert Configuration Summary:');
    console.log('   Proximity Alerts: 3 (0.25mi, 0.5mi, 1.0mi)');
    console.log('   Boundary Alerts: 3 (0.25mi, 0.5mi, 1.0mi)');
    console.log('   Overlap Alerts: 2 (Warning, Critical)');

  } catch (error) {
    console.error('❌ Error seeding alert configurations:', error.message);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.close();
      console.log('Database connection closed');
    }
    console.log('\n✅ Done!');
  }
}

seedAlertConfigs();
