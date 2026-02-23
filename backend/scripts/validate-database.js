require('dotenv').config();
const { connectToDatabase, closeConnection, getConnection, sql } = require('../src/config/database');
const { logger } = require('../src/config/logger');

const validateDatabase = async () => {
  console.log('🔍 Validating database structure...');
  
  try {
    await connectToDatabase();
    const pool = getConnection();
    
    // Check all required tables exist
    const requiredTables = [
      'Agencies', 'Subdivisions', 'Users', 'Tracks', 'Milepost_Geometry',
      'Authorities', 'Authority_Overlaps', 'Pin_Types', 'Pins', 'Trips',
      'Alert_Configurations', 'Branding_Configurations', 'GPS_Logs',
      'Alert_Logs', 'System_Audit_Logs', 'Offline_Downloads',
      'Mobile_Devices', 'Data_Sync_Queue', 'SchemaMigrations'
    ];
    
    console.log('\n📊 Checking required tables:');
    
    for (const table of requiredTables) {
      const query = `SELECT 1 FROM sys.tables WHERE name = @tableName`;
      const result = await pool.request()
        .input('tableName', sql.NVarChar, table)
        .query(query);
      
      if (result.recordset.length > 0) {
        console.log(`✅ ${table}`);
      } else {
        console.log(`❌ ${table} - MISSING`);
      }
    }
    
    // Check for admin user
    console.log('\n👤 Checking admin user:');
    const adminQuery = `SELECT * FROM Users WHERE Username = 'admin'`;
    const adminResult = await pool.request().query(adminQuery);
    
    if (adminResult.recordset.length > 0) {
      console.log('✅ Admin user exists');
    } else {
      console.log('❌ Admin user not found');
    }
    
    // Check stored procedures
    console.log('\n⚙️ Checking stored procedures:');
    const procedures = ['sp_CreateAuthority', 'sp_CheckProximity', 'sp_CalculateTrackDistance'];
    
    for (const proc of procedures) {
      const procQuery = `SELECT 1 FROM sys.procedures WHERE name = @procName`;
      const procResult = await pool.request()
        .input('procName', sql.NVarChar, proc)
        .query(procQuery);
      
      if (procResult.recordset.length > 0) {
        console.log(`✅ ${proc}`);
      } else {
        console.log(`❌ ${proc} - MISSING`);
      }
    }
    
    // Check functions and views
    console.log('\n🔧 Checking functions and views:');
    const funcQuery = `SELECT 1 FROM sys.objects WHERE name = 'fn_CheckAuthorityOverlap' AND type IN ('FN', 'IF', 'TF')`;
    const funcResult = await pool.request().query(funcQuery);
    
    if (funcResult.recordset.length > 0) {
      console.log('✅ fn_CheckAuthorityOverlap function');
    } else {
      console.log('❌ fn_CheckAuthorityOverlap function - MISSING');
    }
    
    const viewQuery = `SELECT 1 FROM sys.views WHERE name = 'vw_ActiveAuthorities'`;
    const viewResult = await pool.request().query(viewQuery);
    
    if (viewResult.recordset.length > 0) {
      console.log('✅ vw_ActiveAuthorities view');
    } else {
      console.log('❌ vw_ActiveAuthorities view - MISSING');
    }
    
    // Test data insertion
    console.log('\n🧪 Testing data operations:');
    
    try {
      // Test agency insertion
      const testAgencyQuery = `
        INSERT INTO Agencies (Agency_CD, Agency_Name) 
        VALUES ('TEST', 'Test Agency')
      `;
      await pool.request().query(testAgencyQuery);
      console.log('✅ Test agency created');
      
      // Clean up
      const cleanupQuery = `DELETE FROM Agencies WHERE Agency_CD = 'TEST'`;
      await pool.request().query(cleanupQuery);
      console.log('✅ Test cleanup successful');
      
    } catch (error) {
      console.log('❌ Test data operations failed:', error.message);
    }
    
    // Check indexes
    console.log('\n📈 Checking critical indexes:');
    const indexes = [
      { table: 'Authorities', name: 'IX_Authorities_Active' },
      { table: 'GPS_Logs', name: 'IX_GPS_Logs_Recent' },
      { table: 'Alert_Configurations', name: 'IX_Alert_Configs_Agency' }
    ];
    
    for (const index of indexes) {
      const indexQuery = `
        SELECT 1 
        FROM sys.indexes 
        WHERE object_id = OBJECT_ID(@tableName) AND name = @indexName
      `;
      
      const indexResult = await pool.request()
        .input('tableName', sql.NVarChar, index.table)
        .input('indexName', sql.NVarChar, index.name)
        .query(indexQuery);
      
      if (indexResult.recordset.length > 0) {
        console.log(`✅ ${index.name} on ${index.table}`);
      } else {
        console.log(`❌ ${index.name} on ${index.table} - MISSING`);
      }
    }
    
    console.log('\n🎉 Database validation completed!');
    
  } catch (error) {
    console.error('❌ Database validation failed:', error);
    process.exit(1);
  } finally {
    await closeConnection();
  }
};

// Run validation
if (require.main === module) {
  validateDatabase();
}

module.exports = validateDatabase;