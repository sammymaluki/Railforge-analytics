const sql = require('mssql');
require('dotenv').config();

const parseBoolean = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

async function testConnection() {
  console.log('Testing database connection with current configuration...\n');
  
  // Test config 1: From environment variables (Azure SQL or configured server)
  const config1 = {
    server: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 1434,
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || 'Herzog2025!',
    database: process.env.DB_NAME || 'HerzogRailAuthority',
    options: {
      encrypt: parseBoolean(process.env.DB_ENCRYPT, true),
      trustServerCertificate: parseBoolean(process.env.DB_TRUST_SERVER_CERT, true),
      enableArithAbort: true,
      connectTimeout: 10000,
      requestTimeout: 10000
    },
    connectionTimeout: 10000,
    requestTimeout: 10000
  };

  // Test config 2: Local fallback with encryption disabled
  const config2 = {
    server: 'localhost',
    user: 'sa',
    password: 'Herzog2025!',
    database: 'HerzogRailAuthority',
    options: {
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true,
      connectTimeout: 10000,
      requestTimeout: 10000
    },
    connectionTimeout: 10000,
    requestTimeout: 10000
  };

  // Test config 3: Named pipes explicitly
  const config3 = {
    server: 'localhost',
    user: 'sa',
    password: 'Herzog2025!',
    database: 'HerzogRailAuthority',
    options: {
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true,
      connectTimeout: 10000,
      requestTimeout: 10000,
      instanceName: 'MSSQLSERVER'
    },
    connectionTimeout: 10000,
    requestTimeout: 10000
  };

  const configs = [
    { name: 'Environment config (Azure SQL or configured)', config: config1 },
    { name: 'localhost (default)', config: config2 },
    { name: 'Named pipes (MSSQLSERVER)', config: config3 }
  ];

  for (const { name, config } of configs) {
    try {
      console.log(`\n🔄 Trying: ${name}`);
      console.log(`   Config: ${JSON.stringify(config, null, 2).split('\n').slice(1).join('\n   ')}`);
      const pool = await sql.connect(config);
      const result = await pool.request().query('SELECT @@VERSION as version');
      console.log(`✅ SUCCESS with ${name}`);
      console.log(`   Version: ${result.recordset[0].version.substring(0, 50)}...`);
      await pool.close();
      break; // Exit after first successful connection
    } catch (error) {
      console.log(`❌ FAILED with ${name}`);
      console.log(`   Error code: ${error.code}`);
      console.log(`   Error message: ${error.message}`);
    }
  }

  console.log('\n✅ Connection test complete');
}

testConnection().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
