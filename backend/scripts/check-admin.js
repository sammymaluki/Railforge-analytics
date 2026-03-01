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

async function checkAdminUser() {
  try {
    await sql.connect(config);
    const result = await sql.query`
      SELECT User_ID, Username, Email, Role, Agency_ID, Is_Active 
      FROM Users 
      WHERE Username = 'admin'
    `;
    console.log('Admin User Details:');
    console.log(JSON.stringify(result.recordset, null, 2));
  } catch (err) {
    console.error('Database Error:', err.message);
  } finally {
    await sql.close();
  }
}

checkAdminUser();
