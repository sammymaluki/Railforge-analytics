/**
 * Permission Manager
 * Handles iOS and Android permission requests with clear explanations
 */
import { Platform, Alert, Linking } from 'react-native';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';
import logger from './logger';

class PermissionManager {
  constructor() {
    this.permissions = {
      location: {
        granted: false,
        backgroundGranted: false,
      },
      notifications: {
        granted: false,
      },
      camera: {
        granted: false,
      },
      photos: {
        granted: false,
      },
    };
  }

  /**
   * Request location permissions with clear explanation
   */
  async requestLocationPermission(needsBackground = false) {
    try {
      // First check current status
      const { status: currentStatus } = await Location.getForegroundPermissionsAsync();
      
      if (currentStatus === 'granted') {
        this.permissions.location.granted = true;
        
        if (needsBackground) {
          return await this.requestBackgroundLocation();
        }
        
        return true;
      }

      // Show explanation before requesting
      const shouldRequest = await this.showPermissionExplanation({
        title: 'Location Permission Required',
        message: 'RailForge Analytics needs access to your location to:\n\n' +
                 '• Track your position on railroad tracks\n' +
                 '• Alert you when approaching authority limits\n' +
                 '• Warn you about nearby workers\n' +
                 '• Log your trip for safety records\n\n' +
                 'Your location is only tracked during active authorities.',
        buttonText: 'Allow Location Access',
      });

      if (!shouldRequest) {
        logger.warn('Permissions', 'User declined location permission explanation');
        return false;
      }

      // Request foreground permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      this.permissions.location.granted = status === 'granted';
      logger.info('Permissions', `Location permission: ${status}`);

      if (this.permissions.location.granted && needsBackground) {
        return await this.requestBackgroundLocation();
      }

      return this.permissions.location.granted;
    } catch (error) {
      logger.error('Permissions', 'Failed to request location permission', error);
      return false;
    }
  }

  /**
   * Request background location permission with iOS-specific explanation
   */
  async requestBackgroundLocation() {
    try {
      const { status: currentStatus } = await Location.getBackgroundPermissionsAsync();
      
      if (currentStatus === 'granted') {
        this.permissions.location.backgroundGranted = true;
        return true;
      }

      const explanation = Platform.select({
        ios: {
          title: 'Background Location for Safety',
          message: 'For your safety, RailForge Analytics needs to track your location even when the app is in the background or locked.\n\n' +
                   '⚠️ IMPORTANT FOR iOS:\n' +
                   '• Tap "Allow" on the next screen\n' +
                   '• Then tap "Change to Always Allow"\n\n' +
                   'This ensures:\n' +
                   '• Continuous tracking during active work\n' +
                   '• Alerts even when screen is locked\n' +
                   '• Complete safety coverage\n\n' +
                   'You can stop tracking anytime by ending your authority.',
          buttonText: 'Continue',
        },
        android: {
          title: 'Allow All the Time Location',
          message: 'RailForge Analytics needs location access "All the time" to:\n\n' +
                   '• Track your position while app is in background\n' +
                   '• Send safety alerts even when screen is off\n' +
                   '• Ensure continuous protection\n\n' +
                   'You can disable this when not working.',
          buttonText: 'Allow All the Time',
        },
      });

      const shouldRequest = await this.showPermissionExplanation(explanation);
      
      if (!shouldRequest) {
        logger.warn('Permissions', 'User declined background location explanation');
        return false;
      }

      const { status } = await Location.requestBackgroundPermissionsAsync();
      
      this.permissions.location.backgroundGranted = status === 'granted';
      logger.info('Permissions', `Background location permission: ${status}`);

      // If iOS and user selected "When In Use" instead of "Always"
      if (Platform.OS === 'ios' && status !== 'granted') {
        this.showBackgroundLocationHelp();
      }

      return this.permissions.location.backgroundGranted;
    } catch (error) {
      logger.error('Permissions', 'Failed to request background location', error);
      return false;
    }
  }

  /**
   * Request notification permission
   */
  async requestNotificationPermission() {
    try {
      if (Constants.appOwnership === 'expo') {
        logger.warn(
          'Permissions',
          'Skipping notification permission request in Expo Go (use a development build for push notifications).'
        );
        this.permissions.notifications.granted = false;
        return false;
      }

      const { status: currentStatus } = await Notifications.getPermissionsAsync();
      
      if (currentStatus === 'granted') {
        this.permissions.notifications.granted = true;
        return true;
      }

      const shouldRequest = await this.showPermissionExplanation({
        title: 'Notifications for Safety Alerts',
        message: 'RailForge Analytics needs notification permission to:\n\n' +
                 '• Alert you when approaching track limits\n' +
                 '• Warn you about nearby workers\n' +
                 '• Notify you of overlapping authorities\n\n' +
                 'These alerts are critical for safety.',
        buttonText: 'Allow Notifications',
      });

      if (!shouldRequest) {
        return false;
      }

      const { status } = await Notifications.requestPermissionsAsync();
      
      this.permissions.notifications.granted = status === 'granted';
      logger.info('Permissions', `Notification permission: ${status}`);

      return this.permissions.notifications.granted;
    } catch (error) {
      logger.error('Permissions', 'Failed to request notification permission', error);
      return false;
    }
  }

  /**
   * Request camera permission (for pin drops)
   */
  async requestCameraPermission() {
    try {
      const { status: currentStatus } = await ImagePicker.getCameraPermissionsAsync();
      
      if (currentStatus === 'granted') {
        this.permissions.camera.granted = true;
        return true;
      }

      const shouldRequest = await this.showPermissionExplanation({
        title: 'Camera Access for Photos',
        message: 'RailForge Analytics needs camera access to:\n\n' +
                 '• Take photos for pin drops\n' +
                 '• Document track conditions\n' +
                 '• Attach images to reports\n\n' +
                 'Photos are included in your trip reports.',
        buttonText: 'Allow Camera',
      });

      if (!shouldRequest) {
        return false;
      }

      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      
      this.permissions.camera.granted = status === 'granted';
      logger.info('Permissions', `Camera permission: ${status}`);

      return this.permissions.camera.granted;
    } catch (error) {
      logger.error('Permissions', 'Failed to request camera permission', error);
      return false;
    }
  }

  /**
   * Request photo library permission
   */
  async requestPhotoLibraryPermission() {
    try {
      const { status: currentStatus } = await ImagePicker.getMediaLibraryPermissionsAsync();
      
      if (currentStatus === 'granted') {
        this.permissions.photos.granted = true;
        return true;
      }

      const shouldRequest = await this.showPermissionExplanation({
        title: 'Photo Library Access',
        message: 'RailForge Analytics needs photo library access to:\n\n' +
                 '• Attach existing photos to pin drops\n' +
                 '• Include images in reports\n\n' +
                 'This permission is optional.',
        buttonText: 'Allow Photo Library',
      });

      if (!shouldRequest) {
        return false;
      }

      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      this.permissions.photos.granted = status === 'granted';
      logger.info('Permissions', `Photo library permission: ${status}`);

      return this.permissions.photos.granted;
    } catch (error) {
      logger.error('Permissions', 'Failed to request photo library permission', error);
      return false;
    }
  }

  /**
   * Show permission explanation dialog
   */
  showPermissionExplanation({ title, message, buttonText }) {
    return new Promise((resolve) => {
      Alert.alert(
        title,
        message,
        [
          {
            text: 'Not Now',
            style: 'cancel',
            onPress: () => resolve(false),
          },
          {
            text: buttonText,
            onPress: () => resolve(true),
          },
        ],
        { cancelable: false }
      );
    });
  }

  /**
   * Help user fix background location if they selected "When In Use"
   */
  showBackgroundLocationHelp() {
    Alert.alert(
      'Background Location Not Enabled',
      'For full safety coverage, you need to enable "Always" location access.\n\n' +
      'To fix this:\n' +
      '1. Open Settings\n' +
      '2. Go to RailForge Analytics\n' +
      '3. Tap Location\n' +
      '4. Select "Always"\n\n' +
      'Would you like to open Settings now?',
      [
        {
          text: 'Later',
          style: 'cancel',
        },
        {
          text: 'Open Settings',
          onPress: () => Linking.openSettings(),
        },
      ]
    );
  }

  /**
   * Check all permissions status
   */
  async checkAllPermissions() {
    try {
      const [location, camera, photos] = await Promise.all([
        Location.getForegroundPermissionsAsync(),
        ImagePicker.getCameraPermissionsAsync(),
        ImagePicker.getMediaLibraryPermissionsAsync(),
      ]);

      this.permissions.location.granted = location.status === 'granted';
      if (Constants.appOwnership === 'expo') {
        this.permissions.notifications.granted = false;
      } else {
        const notifications = await Notifications.getPermissionsAsync();
        this.permissions.notifications.granted = notifications.status === 'granted';
      }
      this.permissions.camera.granted = camera.status === 'granted';
      this.permissions.photos.granted = photos.status === 'granted';

      logger.info('Permissions', 'Permission status checked', this.permissions);

      return this.permissions;
    } catch (error) {
      logger.error('Permissions', 'Failed to check permissions', error);
      return this.permissions;
    }
  }

  /**
   * Get permission status
   */
  getPermissions() {
    return { ...this.permissions };
  }
}

// Export singleton
const permissionManager = new PermissionManager();
export default permissionManager;
