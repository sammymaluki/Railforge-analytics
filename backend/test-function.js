require('dotenv').config();
const sql = require('mssql');

const config = {
  server: 'localhost',
  port: 1434,
  user: 'sa',
  password: 'Herzog2025!',
  database: 'HerzogRailAuthority',
  options: {
    encrypt: false,
    trustServerCertificate: true,
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
