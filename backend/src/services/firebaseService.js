// backend/src/services/firebaseService.js
const { logger } = require('../config/logger');
const db = require('../config/database');
const path = require('path');
const fs = require('fs');

let admin = null;
try {
  // Keep push optional in local/dev setups where firebase-admin is not installed yet.
  // eslint-disable-next-line global-require
  admin = require('firebase-admin');
} catch (error) {
  admin = null;
}

class FirebaseService {
  constructor() {
    this.initialized = false;
    this.initializeFirebase();
  }

  initializeFirebase() {
    try {
      if (!admin) {
        logger.warn('firebase-admin module not installed. Push notifications disabled.');
        return;
      }

      if (!admin.apps.length) {
        // Try to load from file first, then fall back to environment variable
        let serviceAccount = null;
        const serviceAccountPath = path.join(__dirname, '../../firebase-service-account.json');
        
        if (fs.existsSync(serviceAccountPath)) {
          const fileContent = fs.readFileSync(serviceAccountPath, 'utf8');
          serviceAccount = JSON.parse(fileContent);
        } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
          serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        }
        
        if (!serviceAccount || !serviceAccount.project_id) {
          logger.warn('Firebase service account not configured. Push notifications disabled.');
          return;
        }

        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: serviceAccount.project_id,
        });

        this.initialized = true;
        logger.info('Firebase Admin SDK initialized');
      } else {
        this.initialized = true;
      }
    } catch (error) {
      logger.error('Failed to initialize Firebase:', error);
    }
  }

  async sendPushNotification(userId, notification) {
    try {
      if (!this.initialized) {
        logger.warn('Firebase not initialized. Skipping push notification.');
        return false;
      }

      // Get user's FCM tokens from database
      const query = `
        SELECT push_token 
        FROM Mobile_Devices 
        WHERE User_ID = @UserId AND Is_Active = 1 AND push_token IS NOT NULL
      `;

      const request = new db.Request();
      request.input('UserId', db.Int, userId);

      const result = await request.query(query);
      
      if (result.recordset.length === 0) {
        logger.info(`No active devices found for user ${userId}`);
        return false;
      }

      const tokens = result.recordset.map(device => device.push_token).filter(token => token);
      
      if (tokens.length === 0) {
        logger.info(`No valid FCM tokens for user ${userId}`);
        return false;
      }

      // Prepare notification message
      const message = {
        notification: {
          title: notification.title,
          body: notification.body,
          imageUrl: notification.imageUrl,
        },
        data: {
          type: notification.data?.type || 'alert',
          alertId: notification.data?.alertId?.toString() || '',
          authorityId: notification.data?.authorityId?.toString() || '',
          timestamp: new Date().toISOString(),
          ...notification.data,
        },
        android: {
          priority: notification.priority || 'high',
          notification: {
            sound: 'default',
            channelId: 'herzog_alerts',
            icon: 'ic_notification',
            color: '#FFD100',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
              threadId: 'herzog-rail-authority',
            },
          },
        },
        tokens,
      };

      // Send to all devices
      const response = await admin.messaging().sendMulticast(message);
      
      logger.info(`Push notification sent to ${response.successCount} device(s) for user ${userId}`);
      
      if (response.failureCount > 0) {
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            logger.error(`Failed to send to token ${tokens[idx]}:`, resp.error);
          }
        });
      }

      // Remove invalid tokens
      const tokensToRemove = tokens.filter((token, idx) => {
        const resp = response.responses[idx];
        return !resp.success && 
               resp.error?.code === 'messaging/registration-token-not-registered';
      });

      if (tokensToRemove.length > 0) {
        await this.removeInvalidTokens(tokensToRemove);
      }

      return response.successCount > 0;
    } catch (error) {
      logger.error('Error sending push notification:', error);
      return false;
    }
  }

  async sendToTopic(topic, notification) {
    try {
      if (!this.initialized) {
        return false;
      }

      const message = {
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: notification.data || {},
        topic: topic,
      };

      const response = await admin.messaging().send(message);
      logger.info(`Push notification sent to topic ${topic}: ${response}`);
      return true;
    } catch (error) {
      logger.error(`Error sending to topic ${topic}:`, error);
      return false;
    }
  }

  async sendAuthorityOverlapAlert(authorityData, overlapData) {
    const notification = {
      title: '🚨 Authority Overlap Detected',
      body: `Your authority overlaps with ${overlapData.Employee_Name_Display}`,
      data: {
        type: 'authority_overlap',
        alertId: `overlap_${authorityData.Authority_ID}_${overlapData.Authority_ID}`,
        authorityId: authorityData.Authority_ID.toString(),
        overlappingAuthority: JSON.stringify({
          employeeName: overlapData.Employee_Name_Display,
          employeeContact: overlapData.Employee_Contact_Display,
          beginMP: overlapData.Begin_MP,
          endMP: overlapData.End_MP,
          trackType: overlapData.Track_Type,
          trackNumber: overlapData.Track_Number,
        }),
        notificationPolicy: overlapData.notificationPolicy
          ? JSON.stringify(overlapData.notificationPolicy)
          : '',
        priority: 'high',
      },
    };

    return this.sendPushNotification(authorityData.User_ID, notification);
  }

  async sendProximityAlert(userId, proximityData) {
    const notification = {
      title: `${proximityData.level === 'critical' ? '🚨' : '⚠️'} Proximity Alert`,
      body: `You are within ${proximityData.distance} miles of ${proximityData.otherUser.employeeName}`,
      data: {
        type: 'proximity_alert',
        level: proximityData.level,
        distance: proximityData.distance.toString(),
        otherUser: JSON.stringify(proximityData.otherUser),
        notificationPolicy: proximityData.notificationPolicy
          ? JSON.stringify(proximityData.notificationPolicy)
          : '',
        priority: proximityData.level === 'critical' ? 'high' : 'normal',
      },
    };

    return this.sendPushNotification(userId, notification);
  }

  async sendBoundaryAlert(userId, boundaryData) {
    const notification = {
      title: `${boundaryData.level === 'critical' ? '🚨' : '⚠️'} Boundary Alert`,
      body: `Approaching ${boundaryData.boundary} boundary (${boundaryData.distance} miles)`,
      data: {
        type: 'boundary_alert',
        authorityId: boundaryData.authorityId.toString(),
        boundary: boundaryData.boundary,
        distance: boundaryData.distance.toString(),
        level: boundaryData.level,
        notificationPolicy: boundaryData.notificationPolicy
          ? JSON.stringify(boundaryData.notificationPolicy)
          : '',
        priority: boundaryData.level === 'critical' ? 'high' : 'normal',
      },
    };

    return this.sendPushNotification(userId, notification);
  }

  async sendTripReportNotification(userId, reportData) {
    const notification = {
      title: '📋 Trip Report Generated',
      body: `Your trip report for ${reportData.subdivision} is ready`,
      data: {
        type: 'trip_report',
        reportId: reportData.reportId.toString(),
        authorityId: reportData.authorityId.toString(),
        downloadUrl: reportData.downloadUrl || '',
        priority: 'normal',
      },
    };

    return this.sendPushNotification(userId, notification);
  }

  async removeInvalidTokens(tokens) {
    try {
      const query = `
        UPDATE Mobile_Devices 
        SET push_token = NULL, Modified_Date = GETDATE()
        WHERE push_token IN (${tokens.map((_, i) => `@Token${i}`).join(',')})
      `;

      const request = new db.Request();
      tokens.forEach((token, i) => {
        request.input(`Token${i}`, db.VarChar, token);
      });

      await request.query(query);
      logger.info(`Removed ${tokens.length} invalid FCM tokens`);
    } catch (error) {
      logger.error('Error removing invalid tokens:', error);
    }
  }

  async updateUserPushToken(userId, deviceId, pushToken) {
    try {
      const query = `
        UPDATE Mobile_Devices 
        SET push_token = @PushToken, Modified_Date = GETDATE()
        WHERE User_ID = @UserId AND Device_ID = @DeviceId
      `;

      const request = new db.Request();
      request.input('UserId', db.Int, userId);
      request.input('DeviceId', db.Int, deviceId);
      request.input('PushToken', db.VarChar, pushToken);

      await request.query(query);
      logger.info(`Updated push token for user ${userId}, device ${deviceId}`);
      return true;
    } catch (error) {
      logger.error('Error updating push token:', error);
      return false;
    }
  }

  async subscribeToTopic(tokens, topic) {
    try {
      if (!this.initialized) {
        return false;
      }

      const response = await admin.messaging().subscribeToTopic(tokens, topic);
      logger.info(`Subscribed ${response.successCount} devices to topic ${topic}`);
      return response.successCount > 0;
    } catch (error) {
      logger.error(`Error subscribing to topic ${topic}:`, error);
      return false;
    }
  }

  async unsubscribeFromTopic(tokens, topic) {
    try {
      if (!this.initialized) {
        return false;
      }

      const response = await admin.messaging().unsubscribeFromTopic(tokens, topic);
      logger.info(`Unsubscribed ${response.successCount} devices from topic ${topic}`);
      return response.successCount > 0;
    } catch (error) {
      logger.error(`Error unsubscribing from topic ${topic}:`, error);
      return false;
    }
  }
}

module.exports = new FirebaseService();
