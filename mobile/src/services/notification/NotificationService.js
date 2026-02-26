// mobile/src/services/notification/NotificationService.js
import messaging from '@react-native-firebase/messaging';
import { Platform, PermissionsAndroid, Vibration } from 'react-native';
import { store } from '../../store/store';
import databaseService from '../database/DatabaseService';
import { showAlert } from '../../store/slices/alertSlice';
import navigationService from '../navigation/NavigationService';

class NotificationService {
  constructor() {
    this.notificationListener = null;
    this.notificationOpenedListener = null;
    this.tokenRefreshListener = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      // Request permissions
      await this.requestPermissions();
      
      // Get FCM token
      const token = await this.getFCMToken();
      if (token) {
        await this.registerToken(token);
      }

      // Setup listeners
      this.setupMessageHandlers();

      this.initialized = true;
      console.log('Notification service initialized');
      return true;
    } catch (error) {
      console.error('Failed to initialize notification service:', error);
      return false;
    }
  }

  async requestPermissions() {
    if (Platform.OS === 'ios') {
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      if (!enabled) {
        console.log('Notification permissions not granted');
      }
      return enabled;
    } else if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
          {
            title: 'RailForge Analytics Notifications',
            message: 'This app needs notification permissions to send safety alerts',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (error) {
        console.error('Android permission error:', error);
        return false;
      }
    }
    return true;
  }

  async getFCMToken() {
    try {
      const token = await messaging().getToken();
      console.log('FCM Token:', token);
      return token;
    } catch (error) {
      console.error('Failed to get FCM token:', error);
      return null;
    }
  }

  async registerToken(token) {
    try {
      const user = await databaseService.getUser();
      if (!user) return false;

      // Save token to local database
      await databaseService.saveDeviceToken(token);

      // Send to server
      const deviceInfo = await this.getDeviceInfo();
      await this.syncTokenToServer(user.user_id, token, deviceInfo);

      return true;
    } catch (error) {
      console.error('Failed to register token:', error);
      return false;
    }
  }

  async getDeviceInfo() {
    return {
      platform: Platform.OS,
      osVersion: Platform.Version,
      deviceModel: Platform.constants?.Model || 'Unknown',
      appVersion: '1.0.0', // Get from app config
    };
  }

  async syncTokenToServer(userId, token, deviceInfo) {
    // This would be implemented with your API service
    console.log('Syncing token to server:', { userId, token, deviceInfo });
  }

  setupMessageHandlers() {
    // Handle notifications when app is in foreground
    this.notificationListener = messaging().onMessage(async (remoteMessage) => {
      console.log('Notification received in foreground:', remoteMessage);
      await this.handleNotification(remoteMessage);
    });

    // Handle notification opened when app is in background/quit
    this.notificationOpenedListener = messaging().onNotificationOpenedApp((remoteMessage) => {
      console.log('Notification opened from background:', remoteMessage);
      this.handleNotificationOpened(remoteMessage);
    });

    // Check if app was opened by a notification
    messaging()
      .getInitialNotification()
      .then((remoteMessage) => {
        if (remoteMessage) {
          console.log('App opened by notification:', remoteMessage);
          this.handleNotificationOpened(remoteMessage);
        }
      });

    // Handle token refresh
    this.tokenRefreshListener = messaging().onTokenRefresh((token) => {
      console.log('FCM token refreshed:', token);
      this.registerToken(token);
    });
  }

  async handleNotification(remoteMessage) {
    const { notification, data } = remoteMessage;
    let notificationPolicy = null;
    try {
      notificationPolicy = data?.notificationPolicy
        ? JSON.parse(data.notificationPolicy)
        : null;
    } catch (error) {
      notificationPolicy = null;
    }

    // Save notification to local database
    await this.saveNotification(remoteMessage);

    // Show in-app alert
    store.dispatch(showAlert({
      type: data?.type || 'notification',
      level: data?.level || 'info',
      title: notification?.title || 'Notification',
      message: notification?.body || '',
      data: data,
      timestamp: new Date().toISOString(),
    }));

    // Play sound/vibration based on alert level
    await this.playAlertFeedback(data?.level, notificationPolicy);

    // Handle specific notification types
    switch (data?.type) {
      case 'authority_overlap':
        await this.handleAuthorityOverlap(data);
        break;
      case 'proximity_alert':
        await this.handleProximityAlert(data);
        break;
      case 'boundary_alert':
        await this.handleBoundaryAlert(data);
        break;
      case 'gps_safety_alert':
        await this.handleGpsSafetyAlert(data);
        break;
      case 'location_reliability':
        await this.handleLocationReliability(data);
        break;
      case 'trip_report':
        await this.handleTripReport(data);
        break;
    }
  }

  async handleNotificationOpened(remoteMessage) {
    const { data } = remoteMessage;

    // Navigate based on notification type
    switch (data?.type) {
      case 'authority_overlap':
        navigationService.navigate('Alerts', {
          screen: 'AlertDetails',
          params: { alertId: data.alertId },
        });
        break;
      case 'proximity_alert':
        navigationService.navigate('Map');
        break;
      case 'trip_report':
        navigationService.navigate('Reports', {
          screen: 'TripReport',
          params: { reportId: data.reportId },
        });
        break;
      default:
        navigationService.navigate('Alerts');
    }
  }

  async handleAuthorityOverlap(data) {
    try {
      const overlapData = JSON.parse(data.overlappingAuthority || '{}');
      
      store.dispatch({
        type: 'alerts/addOverlapAlert',
        payload: {
          type: 'authority_overlap',
          level: 'critical',
          title: 'Authority Conflict',
          message: `Overlap detected with ${overlapData.employeeName}`,
          data: overlapData,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('Error handling authority overlap:', error);
    }
  }

  async handleProximityAlert(data) {
    try {
      const otherUser = JSON.parse(data.otherUser || '{}');
      
      store.dispatch({
        type: 'alerts/addProximityAlert',
        payload: {
          type: 'proximity_alert',
          level: data.level,
          title: 'Proximity Alert',
          message: `${data.level.toUpperCase()}: Within ${data.distance} miles of ${otherUser.employeeName}`,
          data: { ...data, otherUser },
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('Error handling proximity alert:', error);
    }
  }

  async handleBoundaryAlert(data) {
    store.dispatch({
      type: 'alerts/addBoundaryAlert',
      payload: {
        type: 'boundary_alert',
        level: data.level,
        title: 'Boundary Alert',
        message: `Approaching ${data.boundary} boundary (${data.distance} miles)`,
        data: data,
        timestamp: new Date().toISOString(),
      },
    });
  }

  async handleGpsSafetyAlert(data) {
    store.dispatch({
      type: 'alerts/addAlert',
      payload: {
        type: 'gps_safety_alert',
        level: data.level || 'critical',
        title: 'GPS Safety Alert',
        message: data.message || 'GPS safety condition detected',
        data,
        timestamp: new Date().toISOString(),
      },
    });
  }

  async handleLocationReliability(data) {
    store.dispatch({
      type: 'alerts/addAlert',
      payload: {
        type: 'location_reliability',
        level: data.mode === 'UNRELIABLE' ? 'warning' : 'informational',
        title: 'Location Reliability',
        message: data.message || 'Location reliability changed',
        data,
        timestamp: new Date().toISOString(),
      },
    });
  }

  async handleTripReport(data) {
    navigationService.navigate('Reports', {
      screen: 'TripReport',
      params: { reportId: data.reportId },
    });
  }

  async playAlertFeedback(level, notificationPolicy = null) {
    const settings = store.getState()?.settings || {};
    const notificationsEnabled = settings.notificationsEnabled !== false;
    const vibrationEnabled = notificationsEnabled
      && settings.vibrationEnabled !== false
      && notificationPolicy?.vibrationEnabled !== false;
    const soundEnabled = notificationsEnabled
      && settings.soundEnabled !== false
      && notificationPolicy?.audioEnabled !== false;

    if (!vibrationEnabled && !soundEnabled) {
      return;
    }

    // Implement sound/vibration based on alert level
    switch (level) {
      case 'critical':
        if (vibrationEnabled) {
          Vibration.vibrate([0, 400, 200, 400]);
        }
        break;
      case 'warning':
        if (vibrationEnabled) {
          Vibration.vibrate([0, 250, 150, 250]);
        }
        break;
      default:
        if (vibrationEnabled) {
          Vibration.vibrate(160);
        }
        break;
    }

    if (soundEnabled) {
      // Keep explicit audio playback handled by notification channels/assets.
      console.log(`Notification sound enabled for level ${level || 'info'}`);
    }
  }

  async saveNotification(remoteMessage) {
    try {
      const user = await databaseService.getUser();
      if (!user) return;

      const notificationData = {
        User_ID: user.user_id,
        Notification_ID: remoteMessage.messageId || Date.now().toString(),
        Title: remoteMessage.notification?.title || '',
        Body: remoteMessage.notification?.body || '',
        Data: JSON.stringify(remoteMessage.data || {}),
        Type: remoteMessage.data?.type || 'notification',
        Level: remoteMessage.data?.level || 'info',
        Is_Read: 0,
        Received_At: new Date().toISOString(),
      };

      await databaseService.saveNotification(notificationData);
    } catch (error) {
      console.error('Failed to save notification:', error);
    }
  }

  async markNotificationAsRead(notificationId) {
    try {
      await databaseService.markNotificationAsRead(notificationId);
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  }

  async getUnreadNotifications() {
    try {
      const notifications = await databaseService.getUnreadNotifications();
      return notifications;
    } catch (error) {
      console.error('Failed to get unread notifications:', error);
      return [];
    }
  }

  async cleanup() {
    if (this.notificationListener) {
      this.notificationListener();
    }
    if (this.notificationOpenedListener) {
      this.notificationOpenedListener();
    }
    if (this.tokenRefreshListener) {
      this.tokenRefreshListener();
    }
    this.initialized = false;
  }
}

// Export singleton instance
const notificationService = new NotificationService();
export default notificationService;
