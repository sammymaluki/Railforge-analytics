/**
 * Logger Utility for iOS/Android Cross-Platform Debugging
 * Stores logs locally for export to help with iOS debugging
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const LOG_STORAGE_KEY = '@herzog_logs';
const MAX_LOGS = 500; // Keep last 500 log entries
const LOG_LEVELS = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  GPS: 'GPS',
  SYNC: 'SYNC',
  ALERT: 'ALERT',
};

class Logger {
  constructor() {
    this.logs = [];
    this.enabled = true;
    this.loadLogs();
  }

  async loadLogs() {
    try {
      const storedLogs = await AsyncStorage.getItem(LOG_STORAGE_KEY);
      if (storedLogs) {
        this.logs = JSON.parse(storedLogs);
      }
    } catch (error) {
      console.error('Failed to load logs:', error);
    }
  }

  async saveLogs() {
    try {
      // Keep only the latest MAX_LOGS entries
      const logsToSave = this.logs.slice(-MAX_LOGS);
      await AsyncStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(logsToSave));
      this.logs = logsToSave;
    } catch (error) {
      console.error('Failed to save logs:', error);
    }
  }

  log(level, category, message, data = null) {
    if (!this.enabled) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      data: data ? JSON.stringify(data) : null,
    };

    // Add to memory
    this.logs.push(logEntry);

    // Console output with color coding
    const color = this.getColorForLevel(level);
    const prefix = `[${level}][${category}]`;
    
    if (data) {
      console.log(`${prefix} ${message}`, data);
    } else {
      console.log(`${prefix} ${message}`);
    }

    // Persist asynchronously (don't await to avoid blocking)
    this.saveLogs();
  }

  getColorForLevel(level) {
    const colors = {
      DEBUG: '\x1b[36m', // Cyan
      INFO: '\x1b[32m',  // Green
      WARN: '\x1b[33m',  // Yellow
      ERROR: '\x1b[31m', // Red
      GPS: '\x1b[35m',   // Magenta
      SYNC: '\x1b[34m',  // Blue
      ALERT: '\x1b[31m', // Red
    };
    return colors[level] || '';
  }

  debug(category, message, data) {
    this.log(LOG_LEVELS.DEBUG, category, message, data);
  }

  info(category, message, data) {
    this.log(LOG_LEVELS.INFO, category, message, data);
  }

  warn(category, message, data) {
    this.log(LOG_LEVELS.WARN, category, message, data);
  }

  error(category, message, data) {
    this.log(LOG_LEVELS.ERROR, category, message, data);
  }

  gps(message, data) {
    this.log(LOG_LEVELS.GPS, 'GPS', message, data);
  }

  sync(message, data) {
    this.log(LOG_LEVELS.SYNC, 'SYNC', message, data);
  }

  alert(message, data) {
    this.log(LOG_LEVELS.ALERT, 'ALERT', message, data);
  }

  /**
   * Get all logs or filter by category/level
   */
  async getLogs(filters = {}) {
    const { level, category, startTime, endTime } = filters;
    
    let filteredLogs = [...this.logs];

    if (level) {
      filteredLogs = filteredLogs.filter(log => log.level === level);
    }

    if (category) {
      filteredLogs = filteredLogs.filter(log => log.category === category);
    }

    if (startTime) {
      filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) >= new Date(startTime));
    }

    if (endTime) {
      filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) <= new Date(endTime));
    }

    return filteredLogs;
  }

  /**
   * Export logs as formatted string for sharing
   */
  async exportLogs() {
    const logs = await this.getLogs();
    let exportText = '=== RailForge Analytics - Debug Logs ===\n';
    exportText += `Generated: ${new Date().toISOString()}\n`;
    exportText += `Total Entries: ${logs.length}\n\n`;

    logs.forEach(log => {
      exportText += `[${log.timestamp}] [${log.level}] [${log.category}]\n`;
      exportText += `  ${log.message}\n`;
      if (log.data) {
        exportText += `  Data: ${log.data}\n`;
      }
      exportText += '\n';
    });

    return exportText;
  }

  /**
   * Clear all logs
   */
  async clearLogs() {
    this.logs = [];
    await AsyncStorage.removeItem(LOG_STORAGE_KEY);
    this.info('LOGGER', 'Logs cleared');
  }

  /**
   * Get log statistics
   */
  getStats() {
    const stats = {
      total: this.logs.length,
      byLevel: {},
      byCategory: {},
    };

    this.logs.forEach(log => {
      // Count by level
      stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;
      
      // Count by category
      stats.byCategory[log.category] = (stats.byCategory[log.category] || 0) + 1;
    });

    return stats;
  }

  /**
   * Enable/disable logging
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    this.info('LOGGER', `Logging ${enabled ? 'enabled' : 'disabled'}`);
  }
}

// Export singleton instance
const logger = new Logger();
export default logger;
