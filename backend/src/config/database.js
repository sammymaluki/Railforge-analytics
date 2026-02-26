const sql = require('mssql');

const parseBoolean = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const isProduction = process.env.NODE_ENV === 'production';
const encryptConnection = parseBoolean(process.env.DB_ENCRYPT, isProduction);
const trustServerCertificate = parseBoolean(process.env.DB_TRUST_SERVER_CERT, !isProduction);

const dbConfig = {
  server: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'HerzogRailAuthority',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || '',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 1434,
  options: {
    encrypt: encryptConnection,
    trustServerCertificate,
    enableArithAbort: true,
    connectTimeout: 30000,
    requestTimeout: 30000,
    appName: 'SidekickBackend'
  },
  pool: {
    max: 20,
    min: 2,
    idleTimeoutMillis: 60000
  }
};

// Support optional named instance via DB_INSTANCE env var (e.g. SQLEXPRESS)
const dbInstance = process.env.DB_INSTANCE;
if (dbInstance && dbInstance.length > 0) {
  // Tedious accepts `options.instanceName` for named instances
  dbConfig.options.instanceName = dbInstance;
  // If instance name is provided, port is typically dynamic; allow user-provided port to override
  console.log('Database configured to use instance:', dbInstance);
}

// Create connection pool
let pool = null;
let reconnectPromise = null;
let recoveryInFlight = false;
let lastRecoveryAt = 0;
const RECOVERY_COOLDOWN_MS = parseInt(process.env.DB_RECOVERY_COOLDOWN_MS || '5000', 10);

const isPoolUsable = (candidate) => {
  if (!candidate) return false;
  if (candidate.closed === true) return false;
  if (candidate.connected === false) return false;
  if (candidate._connected === false) return false;
  return true;
};

const connectToDatabase = async () => {
  if (reconnectPromise) {
    return reconnectPromise;
  }

  reconnectPromise = (async () => {
  const maxAttempts = parseInt(process.env.DB_CONNECT_RETRY || '3', 10);
  let attempt = 0;

  while (attempt < maxAttempts) {
    try {
      attempt += 1;
      console.log(`Attempting DB connection (attempt ${attempt}/${maxAttempts}) to ${dbConfig.server}${dbInstance ? `\\${dbInstance}` : ''}:${dbConfig.port}`);
      pool = await sql.connect(dbConfig);
      console.log('Connected to SQL Server successfully');
      return pool;
    } catch (error) {
      // Log useful diagnostics
      console.error(`Database connection attempt ${attempt} failed:`, error && error.message ? error.message : error);
      // If this was the last attempt, return null
      if (attempt >= maxAttempts) {
        pool = null;
        return null;
      }
      // Back off before retrying
      const delay = attempt * 1000;
      console.log(`Waiting ${delay}ms before next DB connect attempt`);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((res) => setTimeout(res, delay));
    }
  }
  return null;
  })();

  try {
    return await reconnectPromise;
  } finally {
    reconnectPromise = null;
  }
};

// Wrapper to get the pool if available, with recovery attempt
const getConnection = () => {
  if (!pool) {
    throw new Error('Database not connected. Call connectToDatabase first or ensure DB is reachable.');
  }
  return pool;
};

const getConnectionWithRecovery = async (options = {}) => {
  const { forceReconnect = false } = options;

  // Avoid closing the shared pool during live traffic. Doing so aborts
  // in-flight requests in tarn/mssql and causes cascading "Error: aborted".
  // Only run a forced recovery when the pool is already unusable.
  if (forceReconnect && !isPoolUsable(pool)) {
    const now = Date.now();
    if (!recoveryInFlight && (now - lastRecoveryAt > RECOVERY_COOLDOWN_MS)) {
      recoveryInFlight = true;
      try {
        await closeConnection();
        lastRecoveryAt = Date.now();
      } finally {
        recoveryInFlight = false;
      }
    }
  }

  if (!isPoolUsable(pool)) {
    await connectToDatabase();
  }

  if (!isPoolUsable(pool)) {
    throw new Error('Database not connected. Failed to recover SQL connection.');
  }

  return pool;
};

// Request wrapper used across the codebase (so existing `new db.Request()` calls work)
function Request() {
  if (pool) {
    return pool.request();
  }

  // Return a safe mock request that supports chaining but fails gracefully on execution
  const mock = {
    _inputs: {},
    input(name, type, value) {
      this._inputs[name] = value;
      return this;
    },
    // support .query and .execute returning rejected promises so callers can handle errors asynchronously
    query() {
      return Promise.reject(Object.assign(new Error('Database not connected'), { code: 'DB_NOT_CONNECTED' }));
    },
    execute() {
      return Promise.reject(Object.assign(new Error('Database not connected'), { code: 'DB_NOT_CONNECTED' }));
    }
  };

  return mock;
}

const closeConnection = async () => {
  try {
    if (pool) {
      await pool.close();
      console.log('Database connection closed');
      pool = null;
    }
  } catch (error) {
    console.error('Error closing database connection:', error);
  }
};

module.exports = {
  sql,
  connectToDatabase,
  getConnection,
  getConnectionWithRecovery,
  closeConnection,
  Request,
  // re-export common SQL types for convenience (used like `db.Int` in code)
  Int: sql.Int,
  VarChar: sql.VarChar,
  NVarChar: sql.NVarChar,
  DateTime: sql.DateTime,
  Bit: sql.Bit
};
