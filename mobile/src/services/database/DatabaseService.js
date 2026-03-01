import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Simple AsyncStorage-based database service for Expo Go compatibility
// For production, replace with react-native-sqlite-storage in development build

class DatabaseService {
  constructor() {
    this.isInitialized = false;
    this.storagePrefix = '@HerzogDB:';
  }

  async init() {
    try {
      if (this.isInitialized) {
        return true;
      }

      // Initialize AsyncStorage (no setup needed)
      this.isInitialized = true;
      console.log('Database initialized successfully (AsyncStorage mode)');
      return true;
    } catch (error) {
      console.error('Database initialization error:', error);
      // Don't throw - allow app to continue
      return false;
    }
  }

  async createTables() {
    // No-op for AsyncStorage mode
    return true;
  }

  async createIndexes() {
    // No-op for AsyncStorage mode
    return true;
  }

  async executeQuery(query, params = []) {
    // Query execution - data comes from backend API, not local DB
    return { rows: { length: 0, item: () => null } };
  }

  async executeTransaction(queries) {
    // Mock transaction
    return [];
  }

  // User operations
  async saveUser(userData) {
    try {
      // Store user data in AsyncStorage
      await AsyncStorage.setItem(`${this.storagePrefix}user`, JSON.stringify(userData));
      return userData;
    } catch (error) {
      console.error('Error saving user:', error);
      throw error;
    }
  }

  async getUser() {
    try {
      const userJson = await AsyncStorage.getItem(`${this.storagePrefix}user`);
      return userJson ? JSON.parse(userJson) : null;
    } catch (error) {
      console.error('Error getting user:', error);
      return null;
    }
  }

  async updateUserToken(userId, token) {
    try {
      const userJson = await AsyncStorage.getItem(`${this.storagePrefix}user`);
      if (userJson) {
        const user = JSON.parse(userJson);
        user.token = token;
        await AsyncStorage.setItem(`${this.storagePrefix}user`, JSON.stringify(user));
      }
    } catch (error) {
      console.error('Error updating user token:', error);
    }
  }

  async logoutUser() {
    try {
      await AsyncStorage.removeItem(`${this.storagePrefix}user`);
    } catch (error) {
      console.error('Error logging out user:', error);
    }
  }

  // Authority operations
  async saveAuthority(authorityData) {
    try {
      // Store authority in AsyncStorage
      await AsyncStorage.setItem(`${this.storagePrefix}activeAuthority`, JSON.stringify(authorityData));
      return authorityData.Authority_ID || Date.now();
    } catch (error) {
      console.error('Error saving authority:', error);
      throw error;
    }
  }

  async getActiveAuthority() {
    try {
      const authorityJson = await AsyncStorage.getItem(`${this.storagePrefix}activeAuthority`);
      return authorityJson ? JSON.parse(authorityJson) : null;
    } catch (error) {
      console.error('Error getting active authority:', error);
      return null;
    }
  }

  async endAuthority(authorityId, confirmEndTracking = true) {
    try {
      console.log(`📊 DatabaseService: Ending authority ${authorityId}`);
      
      // Remove active authority from AsyncStorage
      await AsyncStorage.removeItem(`${this.storagePrefix}activeAuthority`);
      console.log(`📊 DatabaseService: Removed active authority from AsyncStorage`);
      
      // Note: Additional local database cleanup (pins, GPS logs) would be handled
      // by the sync service when it processes the authority end event
      
      console.log(`📊 DatabaseService: Authority ${authorityId} cleanup complete`);
      return { success: true, authorityId };
    } catch (error) {
      console.error(`❌ DatabaseService: Error ending authority:`, error);
      throw error; // Propagate error so caller knows about failures
    }
  }

  // Pin operations
  async savePin(pinData) {
    const query = `
      INSERT INTO pins (
        pin_id, authority_id, pin_type_id, latitude, longitude,
        track_type, track_number, mp, notes, photo_url,
        photo_local_path, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      pinData.Pin_ID || null,
      pinData.Authority_ID,
      pinData.Pin_Type_ID,
      pinData.Latitude,
      pinData.Longitude,
      pinData.Track_Type,
      pinData.Track_Number,
      pinData.MP,
      pinData.Notes,
      pinData.Photo_URL,
      pinData.Photo_Local_Path,
      'pending'
    ];

    const result = await this.executeQuery(query, params);
    return result.insertId;
  }

  async getAuthorityPins(authorityId) {
    const query = `
      SELECT p.*, pt.pin_category, pt.pin_subtype, pt.color, pt.icon_url
      FROM pins p
      LEFT JOIN pin_types pt ON p.pin_type_id = pt.pin_type_id
      WHERE p.authority_id = ?
      ORDER BY p.created_at DESC
    `;

    const result = await this.executeQuery(query, [authorityId]);
    
    const pins = [];
    for (let i = 0; i < result.rows.length; i++) {
      pins.push(result.rows.item(i));
    }
    return pins;
  }

  // GPS operations
  async saveGPSLog(gpsData) {
    const query = `
      INSERT INTO gps_logs (
        log_id, user_id, authority_id, latitude, longitude,
        speed, heading, accuracy, is_offline, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      gpsData.Log_ID || null,
      gpsData.User_ID,
      gpsData.Authority_ID,
      gpsData.Latitude,
      gpsData.Longitude,
      gpsData.Speed || null,
      gpsData.Heading || null,
      gpsData.Accuracy || null,
      gpsData.Is_Offline ? 1 : 0,
      'pending'
    ];

    const result = await this.executeQuery(query, params);
    return result.insertId;
  }

  async getPendingGPSLogs(limit = 100) {
    const query = `
      SELECT * FROM gps_logs 
      WHERE sync_status = 'pending'
      ORDER BY created_at
      LIMIT ?
    `;

    const result = await this.executeQuery(query, [limit]);
    
    const logs = [];
    for (let i = 0; i < result.rows.length; i++) {
      logs.push(result.rows.item(i));
    }
    return logs;
  }

  // Alert operations
  async saveAlert(alertData) {
    const query = `
      INSERT INTO alert_logs (
        alert_log_id, user_id, authority_id, alert_type, alert_level,
        triggered_distance, message, is_delivered, delivered_time,
        is_read, read_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      alertData.Alert_Log_ID || null,
      alertData.User_ID,
      alertData.Authority_ID || null,
      alertData.Alert_Type,
      alertData.Alert_Level,
      alertData.Triggered_Distance || 0,
      alertData.Message,
      alertData.Is_Delivered ? 1 : 0,
      alertData.Delivered_Time || new Date().toISOString(),
      alertData.Is_Read ? 1 : 0,
      alertData.Read_Time || null
    ];

    const result = await this.executeQuery(query, params);
    return result.insertId;
  }

  async getUnreadAlerts() {
    const query = `
      SELECT * FROM alert_logs 
      WHERE is_read = 0
      ORDER BY created_at DESC
    `;

    const result = await this.executeQuery(query);
    
    const alerts = [];
    for (let i = 0; i < result.rows.length; i++) {
      alerts.push(result.rows.item(i));
    }
    return alerts;
  }

  async markAlertAsRead(alertId) {
    const query = `
      UPDATE alert_logs 
      SET is_read = 1, read_time = ?
      WHERE id = ? OR alert_log_id = ?
    `;

    const params = [
      new Date().toISOString(),
      alertId,
      alertId
    ];

    await this.executeQuery(query, params);
  }

  // Offline data operations
  async saveOfflineData(tableName, data) {
    const queries = [];
    
    switch (tableName) {
      case 'agencies':
        queries.push({
          query: `
            INSERT OR REPLACE INTO agencies (
              agency_id, agency_code, agency_name, region,
              contact_email, contact_phone, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          params: [
            data.Agency_ID,
            data.Agency_CD,
            data.Agency_Name,
            data.Region,
            data.Contact_Email,
            data.Contact_Phone,
            data.Is_Active ? 1 : 0
          ]
        });
        break;

      case 'subdivisions':
        queries.push({
          query: `
            INSERT OR REPLACE INTO subdivisions (
              subdivision_id, agency_id, subdivision_code,
              subdivision_name, region, is_active
            ) VALUES (?, ?, ?, ?, ?, ?)
          `,
          params: [
            data.Subdivision_ID,
            data.Agency_ID,
            data.Subdivision_Code,
            data.Subdivision_Name,
            data.Region,
            data.Is_Active ? 1 : 0
          ]
        });
        break;

      case 'tracks':
        queries.push({
          query: `
            INSERT OR REPLACE INTO tracks (
              track_id, subdivision_id, ls, track_type, track_number,
              diverging_track_type, diverging_track_number, bmp, emp,
              asset_name, asset_type, asset_subtype, asset_id,
              asset_status, latitude, longitude, department, notes, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          params: [
            data.Track_ID,
            data.Subdivision_ID,
            data.LS,
            data.Track_Type,
            data.Track_Number,
            data.Diverging_Track_Type,
            data.Diverging_Track_Number,
            data.BMP,
            data.EMP,
            data.Asset_Name,
            data.Asset_Type,
            data.Asset_SubType,
            data.Asset_ID,
            data.Asset_Status,
            data.Latitude,
            data.Longitude,
            data.Department,
            data.Notes,
            data.Is_Active ? 1 : 0
          ]
        });
        break;

      case 'milepost_geometry':
        queries.push({
          query: `
            INSERT OR REPLACE INTO milepost_geometry (
              milepost_id, subdivision_id, mp, latitude, longitude,
              apple_map_url, google_map_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          params: [
            data.Milepost_ID,
            data.Subdivision_ID,
            data.MP,
            data.Latitude,
            data.Longitude,
            data.Apple_Map_URL,
            data.Google_Map_URL
          ]
        });
        break;

      case 'pin_types':
        queries.push({
          query: `
            INSERT OR REPLACE INTO pin_types (
              pin_type_id, agency_id, pin_category, pin_subtype,
              icon_url, color, is_active, sort_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          params: [
            data.Pin_Type_ID,
            data.Agency_ID,
            data.Pin_Category,
            data.Pin_Subtype,
            data.Icon_URL,
            data.Color,
            data.Is_Active ? 1 : 0,
            data.Sort_Order || 0
          ]
        });
        break;

      case 'alert_configurations':
        queries.push({
          query: `
            INSERT OR REPLACE INTO alert_configurations (
              config_id, agency_id, config_type, alert_level,
              distance_miles, message_template, sound_file,
              vibration_pattern, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          params: [
            data.Config_ID,
            data.Agency_ID,
            data.Config_Type,
            data.Alert_Level,
            data.Distance_Miles,
            data.Message_Template,
            data.Sound_File,
            data.Vibration_Pattern,
            data.Is_Active ? 1 : 0
          ]
        });
        break;
    }

    if (queries.length > 0) {
      await this.executeTransaction(queries);
    }
  }

  // Sync queue operations
  async addToSyncQueue(tableName, recordId, operation, data) {
    const query = `
      INSERT INTO sync_queue (table_name, record_id, operation, sync_data)
      VALUES (?, ?, ?, ?)
    `;

    const params = [
      tableName,
      recordId,
      operation,
      JSON.stringify(data)
    ];

    await this.executeQuery(query, params);
  }

  async getPendingSyncItems(limit = 50) {
    const query = `
      SELECT * FROM sync_queue 
      WHERE sync_status = 'pending'
      ORDER BY created_at
      LIMIT ?
    `;

    const result = await this.executeQuery(query, [limit]);
    
    const items = [];
    for (let i = 0; i < result.rows.length; i++) {
      items.push(result.rows.item(i));
    }
    return items;
  }

  async updateSyncStatus(itemId, status, errorMessage = null) {
    const query = `
      UPDATE sync_queue 
      SET sync_status = ?, 
          attempts = attempts + 1,
          last_attempt = ?,
          error_message = ?
      WHERE id = ?
    `;

    const params = [
      status,
      new Date().toISOString(),
      errorMessage,
      itemId
    ];

    await this.executeQuery(query, params);
  }

  // Utility methods
  async clearDatabase() {
    const tables = [
      'users', 'agencies', 'subdivisions', 'tracks',
      'milepost_geometry', 'authorities', 'pins',
      'pin_types', 'gps_logs', 'alert_logs',
      'alert_configurations', 'branding_configurations',
      'sync_queue', 'offline_downloads'
    ];

    for (const table of tables) {
      await this.executeQuery(`DELETE FROM ${table}`);
    }
  }

  async close() {
    if (this.db) {
      await this.db.close();
      this.db = null;
      this.isInitialized = false;
    }
  }
}

// Export singleton instance
const databaseService = new DatabaseService();
export default databaseService;
