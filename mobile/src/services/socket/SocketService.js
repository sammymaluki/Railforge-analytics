import io from 'socket.io-client';
import { CONFIG } from '../../constants/config';
import databaseService from '../database/DatabaseService';
import apiService from '../api/ApiService';
import { Alert, Vibration, InteractionManager } from 'react-native';
import { store } from '../../store/store';
import { setLocationReliability } from '../../store/slices/gpsSlice';
import navigationService from '../../navigation/NavigationService';

class SocketService {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = CONFIG.SOCKET.RECONNECTION_ATTEMPTS;
    this.listeners = new Map();
    this.alertVisible = false;
    this.lastVisualAlertAt = 0;
  }

  normalizeUser(user) {
    if (!user) return null;
    return {
      token: user.token,
      userId: user.User_ID ?? user.user_id ?? user.userId ?? null,
      agencyId: user.Agency_ID ?? user.agency_id ?? user.agencyId ?? null
    };
  }

  async connect() {
    try {
      if (this.socket && this.connected) {
        return this.socket;
      }

      // Get user token
      const rawUser = await databaseService.getUser();
      const user = this.normalizeUser(rawUser);
      if (!user || !user.token) {
        throw new Error('User not authenticated');
      }

      const socketUrl = (CONFIG.SOCKET.URL || '').replace(/\/+$/, '');
      console.log('Socket connecting to:', socketUrl);

      // Create socket connection
      this.socket = io(socketUrl, {
        auth: {
          token: user.token
        },
        path: '/socket.io',
        timeout: 10000,
        forceNew: true,
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: CONFIG.SOCKET.RECONNECTION_DELAY,
        transports: ['websocket', 'polling']
      });

      // Setup event handlers
      this.setupEventHandlers();

      return new Promise((resolve, reject) => {
        let triedRefresh = false;

        this.socket.on('connect', () => {
          console.log('Socket connected');
          this.connected = true;
          this.reconnectAttempts = 0;
          
          // Join user-specific room
          if (user.userId) {
            this.socket.emit('join-user', user.userId);
          }
          
          // Join agency room
          if (user.agencyId) {
            this.socket.emit('join-agency', user.agencyId);
          }
          
          resolve(this.socket);
        });

        this.socket.on('connect_error', async (error) => {
          console.error('Socket connection error:', error);

          // If connect error looks like an auth issue, try refreshing the token once
          const errMsg = (error && error.message) ? error.message.toLowerCase() : '';
          if (!triedRefresh && (errMsg.includes('token') || errMsg.includes('jwt') || errMsg.includes('auth'))) {
            triedRefresh = true;
            try {
              const newToken = await apiService.refreshToken();
              if (newToken) {
                // update local user token (apiService.refreshToken already updates DB)
                // Recreate socket with new token
                this.socket.auth = { token: newToken };
                this.socket.connect();
                return;
              }
            } catch (refreshErr) {
              console.error('Token refresh during socket connect failed:', refreshErr);
            }
          }
        });

        // Timeout after 10 seconds
        setTimeout(() => {
          if (!this.connected) {
            reject(new Error('Socket connection timeout'));
          }
        }, 10000);
      });
    } catch (error) {
      console.error('Socket connection failed:', error);
      throw error;
    }
  }

  setupEventHandlers() {
    if (!this.socket) return;

    // Connection events
    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      this.connected = false;
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log('Socket reconnected after', attemptNumber, 'attempts');
      this.connected = true;
    });

    this.socket.on('reconnect_attempt', (attemptNumber) => {
      console.log('Socket reconnection attempt:', attemptNumber);
      this.reconnectAttempts = attemptNumber;
    });

    this.socket.on('reconnect_error', (error) => {
      console.error('Socket reconnection error:', error);
    });

    this.socket.on('reconnect_failed', () => {
      console.error('Socket reconnection failed');
      this.connected = false;
    });

    // Application events
    this.socket.on('alert', this.handleAlert.bind(this));
    this.socket.on('authority_overlap', this.handleAuthorityOverlap.bind(this));
    this.socket.on('user-location-update', this.handleUserLocationUpdate.bind(this));
    this.socket.on('proximity_alert', this.handleProximityAlert.bind(this));
    this.socket.on('boundary_alert', this.handleBoundaryAlert.bind(this));
    this.socket.on('gps_safety_alert', this.handleGpsSafetyAlert.bind(this));
    this.socket.on('location_reliability', this.handleLocationReliability.bind(this));
  }

  async handleAlert(alertData) {
    console.log('Received alert:', alertData);
    
    // Save alert to database
    try {
      const user = await databaseService.getUser();
      if (user) {
        await databaseService.saveAlert({
          ...alertData,
          User_ID: user.user_id,
          Is_Delivered: 1,
          Delivered_Time: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Failed to save alert:', error);
    }

    // Show notification to user
    this.showNotification(alertData);

    // Trigger listeners
    this.triggerEvent('alert', alertData);
  }

  async handleAuthorityOverlap(overlapData) {
    console.log('Authority overlap detected:', overlapData);
    
    // Save alert to database
    try {
      const user = await databaseService.getUser();
      if (user) {
        await databaseService.saveAlert({
          Alert_Type: 'Overlap_Detected',
          Alert_Level: 'Critical',
          Message: overlapData.message,
          Data: overlapData.details,
          User_ID: user.user_id,
          Is_Delivered: 1,
          Delivered_Time: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Failed to save overlap alert:', error);
    }

    // Show notification
    this.showNotification({
      type: 'AUTHORITY_OVERLAP',
      level: 'critical',
      message: overlapData.message,
      data: overlapData.details
    });

    // Trigger listeners
    this.triggerEvent('authority_overlap', overlapData);
  }

  handleUserLocationUpdate(locationData) {
    // Update other users' locations on map
    this.triggerEvent('user_location_update', locationData);
  }

  handleProximityAlert(alertData) {
    console.log('Proximity alert:', alertData);
    
    // Show notification
    this.showNotification({
      type: 'PROXIMITY',
      level: alertData.level || 'warning',
      message: alertData.message,
      data: alertData.data
    });

    this.triggerEvent('proximity_alert', alertData);
  }

  handleBoundaryAlert(alertData) {
    console.log('Boundary alert:', alertData);
    
    // Show notification
    this.showNotification({
      type: 'BOUNDARY',
      level: alertData.level || 'warning',
      message: alertData.message,
      data: alertData.data
    });

    this.triggerEvent('boundary_alert', alertData);
  }

  handleGpsSafetyAlert(alertData) {
    console.log('GPS safety alert:', alertData);

    this.showNotification({
      type: 'GPS_SAFETY',
      level: alertData.level || 'critical',
      message: alertData.message,
      data: alertData.data
    });

    this.triggerEvent('gps_safety_alert', alertData);
  }

  handleLocationReliability(data) {
    console.log('Location reliability update:', data);
    store.dispatch(setLocationReliability({
      mode: data.mode || 'RELIABLE',
      reasons: Array.isArray(data.reasons) ? data.reasons : [],
      pauseAuthorityAlerts: Boolean(data.pauseAuthorityAlerts),
      message: data.message || null,
      timestamp: data.timestamp || new Date().toISOString(),
    }));

    this.triggerEvent('location_reliability', data);
  }

  showNotification(alertData) {
    const reduxSettings = store.getState()?.settings || {};
    const policy = alertData?.data?.notificationPolicy || {};

    const notificationsEnabled = reduxSettings.notificationsEnabled !== false;
    const visualEnabled = notificationsEnabled && policy.visualEnabled !== false;
    const vibrationEnabled = notificationsEnabled && reduxSettings.vibrationEnabled !== false && policy.vibrationEnabled !== false;
    const soundEnabled = notificationsEnabled && reduxSettings.soundEnabled !== false && policy.audioEnabled !== false;

    if (!visualEnabled && !vibrationEnabled && !soundEnabled) {
      return;
    }

    if (visualEnabled) {
      const now = Date.now();
      // Guard against stacked native alerts that can cause unstable UI mount/unmount behavior.
      if (this.alertVisible && now - this.lastVisualAlertAt < 1500) {
        return;
      }

      const clearAlertState = () => {
        this.alertVisible = false;
        this.lastVisualAlertAt = Date.now();
      };

      this.alertVisible = true;
      this.lastVisualAlertAt = now;

      Alert.alert(
        this.getAlertTitle(alertData),
        alertData.message,
        [
          {
            text: 'OK',
            onPress: () => {
              clearAlertState();
              console.log('Alert dismissed');
            }
          },
          {
            text: 'View Details',
            onPress: () => {
              clearAlertState();
              this.triggerEvent('notification_pressed', alertData);
              InteractionManager.runAfterInteractions(() => {
                setTimeout(() => {
                  navigationService.navigate('MainTabs', {
                    screen: 'Alerts',
                    params: {
                      fromNotification: true,
                      alertType: alertData?.type || null,
                      openedAt: new Date().toISOString(),
                    },
                  });
                }, 50);
              });
            }
          }
        ],
        { cancelable: false, onDismiss: clearAlertState }
      );
    }

    if (vibrationEnabled) {
      this.vibrateDevice(alertData.level);
    }

    if (soundEnabled) {
      // Leave sound handling to push/local notification channels for now.
      console.log(`Sound enabled for ${alertData.level} alert`);
    }
  }

  getAlertTitle(alertData) {
    const titles = {
      'critical': '🚨 CRITICAL ALERT',
      'warning': '⚠️ WARNING',
      'informational': 'ℹ️ INFORMATION',
      'AUTHORITY_OVERLAP': '⚠️ Authority Conflict',
      'PROXIMITY': '👥 Worker Nearby',
      'BOUNDARY': '📍 Boundary Alert'
    };

    return titles[alertData.type] || 
           titles[alertData.level] || 
           'Herzog Alert';
  }

  vibrateDevice(level) {
    if (level === 'critical') {
      Vibration.vibrate([0, 400, 200, 400]);
      return;
    }
    if (level === 'warning') {
      Vibration.vibrate([0, 250, 150, 250]);
      return;
    }
    Vibration.vibrate(180);
  }

  // Event subscription methods
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  triggerEvent(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }

  // Emit methods
  emit(event, data) {
    if (this.socket && this.connected) {
      this.socket.emit(event, data);
      return true;
    }
    console.warn(`Cannot emit ${event}: socket not connected`);
    return false;
  }

  emitLocationUpdate(locationData) {
    if (this.socket && this.connected) {
      this.socket.emit('location-update', locationData);
    }
  }

  emitAuthorityUpdate(authorityData) {
    if (this.socket && this.connected) {
      this.socket.emit('authority-update', authorityData);
    }
  }

  // Connection management
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
      this.listeners.clear();
    }
  }

  isConnected() {
    return this.connected;
  }

  // Reconnection
  async reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      throw new Error('Maximum reconnection attempts reached');
    }

    try {
      await this.connect();
    } catch (error) {
      console.error('Reconnection failed:', error);
      throw error;
    }
  }
}

// Export singleton instance
const socketService = new SocketService();
export default socketService;
