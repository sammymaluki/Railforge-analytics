import NetInfo from '@react-native-community/netinfo';
import { CONFIG } from '../../constants/config';
import databaseService from '../database/DatabaseService';
import apiService from '../api/ApiService';

class SyncService {
  constructor() {
    this.isSyncing = false;
    this.syncInterval = null;
    this.networkState = null;
    this.lastSuccessfulSync = null;
    this.retryCount = 0;
    this.netInfoUnsubscribe = null;
  }

  async init() {
    // Monitor network state
    this.networkState = await NetInfo.fetch();
    
    this.netInfoUnsubscribe = NetInfo.addEventListener(state => {
      const wasConnected = Boolean(this.networkState?.isConnected && this.networkState?.isInternetReachable);
      const nowConnected = Boolean(state?.isConnected && state?.isInternetReachable);
      this.networkState = state;
      
      if (!wasConnected && nowConnected) {
        this.startSyncing();
      }
    });

    // Start sync interval
    this.startSyncInterval();
  }

  startSyncInterval() {
    // Clear existing interval
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    // Start new interval (every 60 seconds)
    this.syncInterval = setInterval(() => {
      if (this.networkState?.isConnected && this.networkState?.isInternetReachable) {
        this.startSyncing();
      }
    }, 60000);
  }

  async startSyncing() {
    if (this.isSyncing) {
      return;
    }

    this.isSyncing = true;

    try {
      // Sync pending items
      await this.syncPendingItems();
      
      // Sync GPS logs
      await this.syncGPSLogs();
      
      // Sync authorities
      await this.syncAuthorities();
      
      // Sync pins
      await this.syncPins();
      
      // Sync alerts
      await this.syncAlerts();
      
      this.lastSuccessfulSync = new Date().toISOString();
      this.retryCount = 0;
      
      console.log('Sync completed successfully');
    } catch (error) {
      console.error('Sync failed:', error);
      this.retryCount++;
      
      // Exponential backoff for retries
      if (this.retryCount < CONFIG.SYNC.MAX_RETRIES) {
        const backoffTime = Math.min(1000 * Math.pow(2, this.retryCount), 300000); // Max 5 minutes
        setTimeout(() => this.startSyncing(), backoffTime);
      }
    } finally {
      this.isSyncing = false;
    }
  }

  async syncPendingItems() {
    try {
      const pendingItems = await databaseService.getPendingSyncItems(CONFIG.SYNC.BATCH_SIZE);
      
      if (pendingItems.length === 0) {
        return;
      }

      const syncPayload = pendingItems.map(item => ({
        id: item.id,
        tableName: item.table_name,
        recordId: item.record_id,
        operation: item.operation,
        data: JSON.parse(item.sync_data),
      }));

      const response = await apiService.syncData(syncPayload);
      
      if (response.success) {
        // Update sync status for successfully synced items
        for (const item of pendingItems) {
          await databaseService.updateSyncStatus(item.id, 'synced');
        }
        
        console.log(`Synced ${pendingItems.length} items`);
      }
    } catch (error) {
      console.error('Failed to sync pending items:', error);
      throw error;
    }
  }

  async syncGPSLogs() {
    try {
      const pendingLogs = await databaseService.getPendingGPSLogs(100);
      
      if (pendingLogs.length === 0) {
        return;
      }

      for (const log of pendingLogs) {
        try {
          await apiService.updateGPSPosition({
            authorityId: log.authority_id,
            latitude: log.latitude,
            longitude: log.longitude,
            speed: log.speed,
            heading: log.heading,
            accuracy: log.accuracy,
            isOffline: log.is_offline,
          });

          await databaseService.executeQuery(
            'UPDATE gps_logs SET sync_status = ? WHERE id = ?',
            ['synced', log.id]
          );
        } catch (error) {
          console.error(`Failed to sync GPS log ${log.id}:`, error);
          // Continue with next log
        }
      }
    } catch (error) {
      console.error('Failed to sync GPS logs:', error);
      throw error;
    }
  }

  async syncAuthorities() {
    try {
      // Get authorities with pending sync
      const query = `
        SELECT * FROM authorities 
        WHERE sync_status = 'pending' 
        AND authority_id IS NOT NULL
      `;
      
      const result = await databaseService.executeQuery(query);
      const pendingAuthorities = [];
      
      for (let i = 0; i < result.rows.length; i++) {
        pendingAuthorities.push(result.rows.item(i));
      }

      for (const authority of pendingAuthorities) {
        try {
          if (authority.is_active === 0 && authority.end_tracking_confirmed === 1) {
            // Authority was ended, sync end status
            await apiService.endAuthority(authority.authority_id, true);
          }
          
          await databaseService.executeQuery(
            'UPDATE authorities SET sync_status = ? WHERE id = ?',
            ['synced', authority.id]
          );
        } catch (error) {
          console.error(`Failed to sync authority ${authority.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to sync authorities:', error);
      throw error;
    }
  }

  async syncPins() {
    try {
      const query = `
        SELECT p.*, a.authority_id as server_authority_id
        FROM pins p
        LEFT JOIN authorities a ON p.authority_id = a.id
        WHERE p.sync_status = 'pending'
        AND p.pin_id IS NULL
        AND a.authority_id IS NOT NULL
      `;
      
      const result = await databaseService.executeQuery(query);
      const pendingPins = [];
      
      for (let i = 0; i < result.rows.length; i++) {
        pendingPins.push(result.rows.item(i));
      }

      for (const pin of pendingPins) {
        try {
          const pinData = {
            authorityId: pin.server_authority_id,
            pinTypeId: pin.pin_type_id,
            latitude: pin.latitude,
            longitude: pin.longitude,
            trackType: pin.track_type,
            trackNumber: pin.track_number,
            mp: pin.mp,
            notes: pin.notes,
            photoUrl: pin.photo_url,
          };

          // Upload photo if exists locally
          try {
            if (pin.photo_local_path) {
              const form = new FormData();
              const file = {
                uri: pin.photo_local_path,
                name: pin.photo_local_path.split('/').pop() || `photo-${Date.now()}.jpg`,
                type: 'image/jpeg'
              };
              form.append('photo', file);
              form.append('authorityId', String(pin.server_authority_id));

              const uploadResp = await apiService.uploadPinPhoto(form);
              if (uploadResp && uploadResp.success && uploadResp.data && uploadResp.data.url) {
                pinData.photoUrl = uploadResp.data.url;
              }
            }

            // Send pin as sync item to server
            const syncItem = [{ tableName: 'pins', recordId: 0, operation: 'INSERT', data: pinData }];
            const res = await apiService.syncData(syncItem);
            if (res && res.success) {
              await databaseService.executeQuery('UPDATE pins SET sync_status = ? WHERE id = ?', ['synced', pin.id]);
            } else {
              await databaseService.updateSyncStatus(pin.id, 'failed', JSON.stringify(res));
            }
          } catch (err) {
            console.error('Failed to upload or sync pin photo:', err);
            await databaseService.updateSyncStatus(pin.id, 'failed', err.message || String(err));
          }
        } catch (error) {
          console.error(`Failed to sync pin ${pin.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to sync pins:', error);
      throw error;
    }
  }

  async syncAlerts() {
    try {
      const query = `
        SELECT * FROM alert_logs 
        WHERE sync_status = 'pending'
        AND alert_log_id IS NULL
      `;
      
      const result = await databaseService.executeQuery(query);
      const pendingAlerts = [];
      
      for (let i = 0; i <result.rows.length; i++) {
        pendingAlerts.push(result.rows.item(i));
      }

      // Alerts are read-only from server, so we just mark them as synced
      for (const alert of pendingAlerts) {
        await databaseService.executeQuery(
          'UPDATE alert_logs SET sync_status = ? WHERE id = ?',
          ['synced', alert.id]
        );
      }
    } catch (error) {
      console.error('Failed to sync alerts:', error);
      throw error;
    }
  }

  async forceSync() {
    return this.startSyncing();
  }

  getSyncStatus() {
    return {
      isSyncing: this.isSyncing,
      lastSuccessfulSync: this.lastSuccessfulSync,
      retryCount: this.retryCount,
      networkState: this.networkState,
    };
  }

  async cleanup() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    if (this.netInfoUnsubscribe) {
      this.netInfoUnsubscribe();
      this.netInfoUnsubscribe = null;
    }
  }
}

// Export singleton instance
const syncService = new SyncService();
export default syncService;
