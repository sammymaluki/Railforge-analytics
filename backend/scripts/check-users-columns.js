const sql = require('mssql');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const parseBoolean = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const config = {
  server: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'HerzogRailAuthority',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'YourStrong!Passw0rd',
  options: {
    encrypt: parseBoolean(process.env.DB_ENCRYPT, true),
    trustServerCertificate: parseBoolean(process.env.DB_TRUST_SERVER_CERT, true)
  }
};

async function checkUsersTable() {
  try {
    await sql.connect(config);
    const result = await sql.query`
      SELECT COLUMN_NAME, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'Users'
      ORDER BY ORDINAL_POSITION
    `;
    console.log('Users Table Columns:');
    result.recordset.forEach(col => {
      console.log(`  ${col.COLUMN_NAME} (${col.DATA_TYPE})`);
    });
  } catch (err) {
    console.error('Database Error:', err.message);
  } finally {
    await sql.close();
  }
}

checkUsersTable();
