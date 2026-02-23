const { getConnection, getConnectionWithRecovery, sql } = require('../config/database');
const { logger } = require('../config/logger');

class BaseModel {
  constructor(tableName) {
    this.tableName = tableName;
  }

  isTransientError(error) {
    // Transient errors that should be retried
    const transientErrorCodes = ['ESOCKET', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT'];
    const transientMessages = ['Connection lost', 'connection timeout', 'failed to connect'];
    
    if (transientErrorCodes.includes(error.code)) return true;
    if (transientMessages.some(msg => error.message?.includes(msg))) return true;
    
    return false;
  }

  async executeQueryWithRetry(query, params = {}, maxRetries = 5) {
    let lastError;
    let forceReconnect = false;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const pool = await getConnectionWithRecovery({ forceReconnect });
        const request = pool.request();
        forceReconnect = false;
        
        // Add parameters to request
        Object.keys(params).forEach(key => {
          const value = params[key];
          const paramType = this.getSqlType(value);
          request.input(key, paramType, value);
        });
        
        const result = await request.query(query);
        return result;
      } catch (error) {
        lastError = error;
        
        if (this.isTransientError(error) && attempt < maxRetries) {
          forceReconnect = true;
          // Exponential backoff: 200ms, 400ms, 800ms, 1600ms, 3200ms
          const delay = Math.pow(2, attempt) * 100;
          logger.warn(`Database query attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms:`, error.message);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          logger.error(`Database query error in ${this.tableName}:`, {
            query,
            params,
            error: error.message
          });
          throw error;
        }
      }
    }
    
    throw lastError;
  }

  async executeQuery(query, params = {}) {
    return this.executeQueryWithRetry(query, params, 5);
  }

  async executeStoredProcedure(procedureName, params = {}) {
    let lastError;
    const maxRetries = 5;
    let forceReconnect = false;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const pool = await getConnectionWithRecovery({ forceReconnect });
        const request = pool.request();
        forceReconnect = false;
        
        // Add parameters to request
        Object.keys(params).forEach(key => {
          const value = params[key];
          
          if (key.startsWith('output_')) {
            // Output parameters: value can be {type: sql.Type, value: defaultValue} or just the type
            if (value && value.type) {
              request.output(key.replace('output_', ''), value.type, value.value);
            } else {
              // Fallback for old style
              request.output(key.replace('output_', ''), value);
            }
          } else {
            const paramType = this.getSqlType(value);
            request.input(key, paramType, value);
          }
        });
        
        const result = await request.execute(procedureName);
        return result;
      } catch (error) {
        lastError = error;
        
        if (this.isTransientError(error) && attempt < maxRetries) {
          forceReconnect = true;
          // Exponential backoff
          const delay = Math.pow(2, attempt) * 100;
          logger.warn(`Stored procedure attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms:`, error.message);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          logger.error(`Stored procedure error ${procedureName}:`, {
            procedureName,
            params,
            error: error.message
          });
          throw error;
        }
      }
    }
    
    throw lastError;
  }

  getSqlType(value) {
    if (value === null || value === undefined) {return sql.NVarChar;}
    
    switch (typeof value) {
    case 'string':
      return sql.NVarChar;
    case 'number':
      return Number.isInteger(value) ? sql.Int : sql.Decimal(10, 4);
    case 'boolean':
      return sql.Bit;
    case 'object':
      if (value instanceof Date) {return sql.DateTime;}
      return sql.NVarChar(sql.MAX);
    default:
      return sql.NVarChar;
    }
  }

  async beginTransaction() {
    const pool = getConnection();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    return transaction;
  }

  async commitTransaction(transaction) {
    await transaction.commit();
  }

  async rollbackTransaction(transaction) {
    await transaction.rollback();
  }
}

module.exports = BaseModel;
