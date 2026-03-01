require('dotenv').config();
const sql = require('mssql');

const parseBoolean = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const config = {
  server: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 1434,
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'Herzog2025!',
  database: process.env.DB_NAME || 'HerzogRailAuthority',
  options: {
    encrypt: parseBoolean(process.env.DB_ENCRYPT, true),
    trustServerCertificate: parseBoolean(process.env.DB_TRUST_SERVER_CERT, true),
    connectTimeout: 15000
  }
};

sql.connect(config).then(pool => {
  pool.request()
    .query('SELECT * FROM sys.objects WHERE name = \'fn_CheckAuthorityOverlap\'')
    .then(result => {
      console.log('Query result:', result.recordset);
      if (result.recordset.length > 0) {
        console.log('✅ Function EXISTS');
      } else {
        console.log('❌ Function MISSING');
      }
      pool.close();
      process.exit(0);
    })
    .catch(err => {
      console.error('Query error:', err.message);
      pool.close();
      process.exit(1);
    });
}).catch(err => {
  console.error('Connection error:', err.message);
  process.exit(1);
});
