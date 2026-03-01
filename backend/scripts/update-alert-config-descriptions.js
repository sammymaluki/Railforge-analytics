require('dotenv').config();
const sql = require('mssql');

const parseBoolean = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

// Database configuration
const sqlConfig = {
  server: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'HerzogRailAuthority',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'Herzog2024!',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 1434,
  options: {
    encrypt: parseBoolean(process.env.DB_ENCRYPT, true),
    trustServerCertificate: parseBoolean(process.env.DB_TRUST_SERVER_CERT, true),
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

async function updateAlertConfigDescriptions() {
  let pool;
  
  try {
    console.log('Updating alert configurations with Time_Minutes and Description...\n');
    
    pool = await sql.connect(sqlConfig);
    console.log('Connected to SQL Server successfully');

    // Update configurations with descriptions
    const updates = [
      {
        configType: 'Proximity_Alert',
        alertLevel: 'Informational',
        distanceMiles: 1.0,
        timeMinutes: 5,
        description: 'Informational alert when workers are detected within 1 mile radius'
      },
      {
        configType: 'Proximity_Alert',
        alertLevel: 'Warning',
        distanceMiles: 0.5,
        timeMinutes: 3,
        description: 'Warning alert when workers approach within 0.5 miles - exercise caution'
      },
      {
        configType: 'Proximity_Alert',
        alertLevel: 'Critical',
        distanceMiles: 0.25,
        timeMinutes: 1,
        description: 'Critical alert requiring immediate action when workers are within 0.25 miles'
      },
      {
        configType: 'Boundary_Alert',
        alertLevel: 'Informational',
        distanceMiles: 1.0,
        timeMinutes: 5,
        description: 'Informational alert for authority boundary approaching at 1 mile'
      },
      {
        configType: 'Boundary_Alert',
        alertLevel: 'Warning',
        distanceMiles: 0.5,
        timeMinutes: 2,
        description: 'Warning alert as authority boundary approaches within 0.5 miles'
      },
      {
        configType: 'Boundary_Alert',
        alertLevel: 'Critical',
        distanceMiles: 0.25,
        timeMinutes: 1,
        description: 'Critical alert when authority boundary exit is imminent at 0.25 miles'
      },
      {
        configType: 'Overlap_Alert',
        alertLevel: 'Warning',
        distanceMiles: 0,
        timeMinutes: 5,
        description: 'Warning alert when authority overlap is detected'
      },
      {
        configType: 'Overlap_Alert',
        alertLevel: 'Critical',
        distanceMiles: 0,
        timeMinutes: 2,
        description: 'Critical alert for severe authority overlap requiring immediate coordination'
      }
    ];

    let updated = 0;
    for (const update of updates) {
      const result = await pool.request()
        .input('configType', sql.NVarChar, update.configType)
        .input('alertLevel', sql.NVarChar, update.alertLevel)
        .input('distanceMiles', sql.Decimal(5, 2), update.distanceMiles)
        .input('timeMinutes', sql.Int, update.timeMinutes)
        .input('description', sql.NVarChar, update.description)
        .query(`
          UPDATE Alert_Configurations
          SET Time_Minutes = @timeMinutes,
              Description = @description,
              Modified_Date = GETDATE()
          WHERE Config_Type = @configType 
            AND Alert_Level = @alertLevel 
            AND Distance_Miles = @distanceMiles
        `);
      if (result.rowsAffected && result.rowsAffected[0] > 0) {
        updated++;
        console.log(`✅ Updated: ${update.configType} - ${update.alertLevel} (${update.distanceMiles}mi)`);
      }
    }

    console.log(`\n✅ Updated ${updated} alert configurations`);

    // Verify the updates
    const verifyResult = await pool.request()
      .query(`
        SELECT Config_ID, Config_Type, Alert_Level, Distance_Miles, Time_Minutes, Description
        FROM Alert_Configurations
        ORDER BY Config_Type, Distance_Miles DESC
      `);

    console.log('\n📊 Updated Alert Configuration Summary:');
    console.log('');
    verifyResult.recordset.forEach(row => {
      console.log(`  [${row.Config_ID}] ${row.Config_Type} (${row.Alert_Level})`);
      console.log(`      Distance: ${row.Distance_Miles}mi | Time: ${row.Time_Minutes ? row.Time_Minutes + ' min' : 'N/A'}`);
      console.log(`      Description: ${row.Description || 'N/A'}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error updating alert configurations:', error.message);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.close();
      console.log('Database connection closed');
    }
    console.log('\n✅ Done!');
  }
}

updateAlertConfigDescriptions();
