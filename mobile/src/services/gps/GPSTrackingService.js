// mobile/src/services/gps/GPSTrackingService.js (Enhanced Version)
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform, Alert, Linking } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { store } from '../../store/store';
import { updatePosition, updateTrackingInfo, startTracking, stopTracking } from '../../store/slices/gpsSlice';
import databaseService from '../database/DatabaseService';
import socketService from '../socket/SocketService';
import apiService from '../api/ApiService';
import syncService from '../sync/SyncService';
import { CONFIG } from '../../constants/config';
import permissionManager from '../../utils/permissionManager';
import logger from '../../utils/logger';
import { globalGPSSmoother } from '../../utils/gpsSmoother';

const GPS_TASK_NAME = 'herzog-gps-tracking';
const GPS_BACKEND_MIN_SEND_INTERVAL_MS = 3000;
const GPS_BACKEND_MIN_MOVE_METERS = 12;
const GPS_DEGRADED_SIGNAL_ALERT_INTERVAL_MS = 60000;
const GPS_ADAPTIVE_RECONFIGURE_INTERVAL_MS = 15000;

const GPS_ADAPTIVE_PROFILES = {
  excellent: {
    accuracyMode: Location.Accuracy.BestForNavigation,
    timeInterval: 2500,
    distanceInterval: 5,
    backendMinIntervalMs: 2500,
    backendMinMoveMeters: 6,
  },
  good: {
    accuracyMode: Location.Accuracy.High,
    timeInterval: 5000,
    distanceInterval: 8,
    backendMinIntervalMs: 3500,
    backendMinMoveMeters: 10,
  },
  fair: {
    accuracyMode: Location.Accuracy.Balanced,
    timeInterval: 8000,
    distanceInterval: 12,
    backendMinIntervalMs: 5000,
    backendMinMoveMeters: 14,
  },
  poor: {
    accuracyMode: Location.Accuracy.Balanced,
    timeInterval: 15000,
    distanceInterval: 25,
    backendMinIntervalMs: 8000,
    backendMinMoveMeters: 20,
  },
  degraded: {
    accuracyMode: Location.Accuracy.LowPower,
    timeInterval: 20000,
    distanceInterval: 40,
    backendMinIntervalMs: 12000,
    backendMinMoveMeters: 30,
  },
};

let gpsServiceInstance = null;

// TaskManager tasks must be defined at module initialization time.
if (!TaskManager.isTaskDefined(GPS_TASK_NAME)) {
  TaskManager.defineTask(GPS_TASK_NAME, async ({ data, error }) => {
    if (error) {
      logger.error('GPS', 'Background task error', error);
      return;
    }

    if (!gpsServiceInstance) {
      logger.warn('GPS', 'Background task fired before GPS service instance was ready');
      return;
    }

    if (data && data.locations && data.locations.length > 0) {
      await gpsServiceInstance.processLocationUpdate(data.locations[0], true);
    }
  });
}

class GPSTrackingService {
  constructor() {
    gpsServiceInstance = this;
    this.isTracking = false;
    this.currentPosition = null;
    this.watchId = null;
    this.backgroundTaskRegistered = false;
    this.lastSyncTime = null;
    this.currentAuthority = null;
    this.currentMilepost = null;
    this.currentTrackInfo = null;
    this.sentAlerts = new Map(); // Track sent alerts to avoid duplicates
    this.boundaryAlertState = new Map(); // Track per-threshold boundary alert repeat timing
    this.boundaryConfigCache = {
      agencyId: null,
      fetchedAt: 0,
      configs: []
    };
    this.gpsSmoother = globalGPSSmoother; // Use global GPS smoother instance
    this.lastBackendSendAt = 0;
    this.lastBackendSentPosition = null;
    this.activeWatchProfile = 'good';
    this.lastAdaptiveWatchUpdateAt = 0;
    this.lastDegradedSignalAlertAt = 0;
    this.netInfoUnsubscribe = null;
  }

  sanitizeNonNegative(value, fallback = 0) {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) return fallback;
    return num;
  }

  sanitizeHeading(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) return null;
    if (num > 360) return num % 360;
    return num;
  }

  calculateDistanceMeters(lat1, lon1, lat2, lon2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  shouldSendBackendUpdate() {
    if (!this.currentPosition) return false;
    const now = Date.now();
    const elapsedMs = now - this.lastBackendSendAt;
    const lastPos = this.lastBackendSentPosition;

    if (!lastPos) {
      return true;
    }

    const movedMeters = this.calculateDistanceMeters(
      lastPos.latitude,
      lastPos.longitude,
      this.currentPosition.latitude,
      this.currentPosition.longitude
    );

    const adaptivePolicy = this.getAdaptivePolicy(this.currentPosition.accuracy, this.currentPosition.speed);
    const minIntervalMs = adaptivePolicy.backendMinIntervalMs || GPS_BACKEND_MIN_SEND_INTERVAL_MS;
    const minMoveMeters = adaptivePolicy.backendMinMoveMeters || GPS_BACKEND_MIN_MOVE_METERS;

    if (elapsedMs >= minIntervalMs) {
      return true;
    }

    return movedMeters >= minMoveMeters;
  }

  getAdaptiveProfileName(accuracy) {
    const value = Number(accuracy);
    if (!Number.isFinite(value) || value <= 0) return 'degraded';
    if (value <= 10) return 'excellent';
    if (value <= 20) return 'good';
    if (value <= 50) return 'fair';
    if (value <= 100) return 'poor';
    return 'degraded';
  }

  getAdaptivePolicy(accuracy, speed = 0) {
    const profile = GPS_ADAPTIVE_PROFILES[this.getAdaptiveProfileName(accuracy)] || GPS_ADAPTIVE_PROFILES.good;
    const speedMps = Number(speed) || 0;

    // If moving faster, push updates more frequently for safer map following.
    if (speedMps > 12) {
      return {
        ...profile,
        backendMinIntervalMs: Math.max(2000, Math.floor(profile.backendMinIntervalMs * 0.75)),
        backendMinMoveMeters: Math.max(5, Math.floor(profile.backendMinMoveMeters * 0.75)),
      };
    }

    return profile;
  }

  deriveGpsConfidence(accuracy, sampleSize = 1) {
    const value = Number(accuracy);
    const samples = Number(sampleSize) || 1;

    if (!Number.isFinite(value) || value <= 0) {
      return { level: 'none', score: 0, label: 'No confidence' };
    }

    let score;
    if (value <= 5) score = 98;
    else if (value <= 10) score = 92;
    else if (value <= 20) score = 80;
    else if (value <= 50) score = 62;
    else if (value <= 100) score = 38;
    else score = 20;

    if (samples >= 4) {
      score = Math.min(99, score + 4);
    }

    if (score >= 90) return { level: 'high', score, label: 'High confidence' };
    if (score >= 70) return { level: 'medium', score, label: 'Medium confidence' };
    if (score >= 45) return { level: 'low', score, label: 'Low confidence' };
    return { level: 'degraded', score, label: 'Unreliable' };
  }

  isSignalDegraded(accuracy) {
    const value = Number(accuracy);
    return !Number.isFinite(value) || value <= 0 || value > 100;
  }

  async maybeHandlePoorSignalDegradation(accuracy) {
    if (!this.isSignalDegraded(accuracy)) {
      return;
    }

    const now = Date.now();
    if ((now - this.lastDegradedSignalAlertAt) < GPS_DEGRADED_SIGNAL_ALERT_INTERVAL_MS) {
      return;
    }

    this.lastDegradedSignalAlertAt = now;

    await this.sendLocalAlert({
      type: 'GPS_DEGRADED',
      level: 'warning',
      title: 'Poor GPS Signal',
      message: 'GPS signal is degraded. Using last reliable location data where possible.',
      data: {
        accuracy,
        degraded: true,
      }
    });
  }

  async triggerSyncOnReconnect() {
    try {
      const pendingLogs = await databaseService.getPendingGPSLogs(1);
      if (pendingLogs.length === 0) {
        return;
      }
      await syncService.forceSync();
    } catch (error) {
      logger.warn('GPS', 'Reconnect sync trigger failed', error);
    }
  }

  async init() {
    try {
      // Foreground location is required. Background is optional on iOS/Expo Go.
      const needsBackgroundPermission =
        CONFIG.GPS.BACKGROUND_TRACKING &&
        Platform.OS === 'android';

      // Use permission manager for better UX with explanations
      const granted = await permissionManager.requestLocationPermission(
        needsBackgroundPermission
      );
      
      if (!granted) {
        throw new Error('Location permission denied');
      }

      await this.registerBackgroundTask();

      if (!this.netInfoUnsubscribe) {
        this.netInfoUnsubscribe = NetInfo.addEventListener((state) => {
          const connected = Boolean(state?.isConnected && state?.isInternetReachable);
          if (connected) {
            this.triggerSyncOnReconnect();
          }
        });
      }

      logger.info('GPS', 'GPS service initialized successfully');
      return true;
    } catch (error) {
      logger.error('GPS', 'GPS service initialization failed', error);
      throw error;
    }
  }

  async registerBackgroundTask() {
    if (Platform.OS === 'android' && CONFIG.GPS.BACKGROUND_TRACKING) {
      try {
        this.backgroundTaskRegistered = TaskManager.isTaskDefined(GPS_TASK_NAME);
        if (!this.backgroundTaskRegistered) {
          logger.warn('GPS', 'Background task is not defined at initialization time');
        }
      } catch (error) {
        logger.error('GPS', 'Failed to register background task', error);
      }
    }
  }

  async startTracking(authority = null) {
    try {
      if (this.isTracking) {
        await this.stopTracking();
      }

      this.currentAuthority = authority || null;
      this.sentAlerts.clear();
      this.boundaryAlertState.clear();
      
      // Reset GPS smoother for new tracking session
      this.gpsSmoother.reset();
      const authorityId = this.currentAuthority?.authority_id || this.currentAuthority?.Authority_ID || this.currentAuthority?.id || null;
      logger.info('GPS', 'Started new tracking session', { authorityId, mode: authorityId ? 'authority' : 'general' });

      // Start foreground tracking with adaptive quality profile.
      await this.startForegroundWatch(this.activeWatchProfile);

      // Start background tracking if enabled
      if (CONFIG.GPS.BACKGROUND_TRACKING && this.backgroundTaskRegistered) {
        await Location.startLocationUpdatesAsync(GPS_TASK_NAME, {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: CONFIG.GPS.DISTANCE_FILTER * 2, // Less frequent in background
          timeInterval: CONFIG.GPS.FASTEST_INTERVAL * 2,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: 'RailForge Analytics',
            notificationBody: 'Tracking your position on tracks',
            notificationColor: '#FFD100',
          },
        });
      }

      this.isTracking = true;
      
      store.dispatch(startTracking());

      logger.info('GPS', 'GPS tracking started', { authorityId });
      
      return true;
    } catch (error) {
      logger.error('GPS', 'Failed to start GPS tracking', error);
      throw error;
    }
  }

  async stopTracking() {
    try {
      if (this.watchId) {
        this.watchId.remove();
        this.watchId = null;
      }

      if (CONFIG.GPS.BACKGROUND_TRACKING) {
        // Check if task is registered before stopping
        const isRegistered = await TaskManager.isTaskRegisteredAsync(GPS_TASK_NAME);
        if (isRegistered) {
          await Location.stopLocationUpdatesAsync(GPS_TASK_NAME);
          logger.info('GPS', 'Background GPS tracking stopped');
        } else {
          logger.info('GPS', 'GPS tracking task was not running');
        }
      }

      this.isTracking = false;
      this.currentPosition = null;
      this.currentAuthority = null;
      this.currentMilepost = null;
      this.currentTrackInfo = null;
      this.lastBackendSendAt = 0;
      this.lastBackendSentPosition = null;
      this.boundaryAlertState.clear();
      this.activeWatchProfile = 'good';
      this.lastAdaptiveWatchUpdateAt = 0;
      this.lastDegradedSignalAlertAt = 0;

      store.dispatch(stopTracking());

      logger.info('GPS', 'GPS tracking stopped');
    } catch (error) {
      logger.error('GPS', 'Failed to stop GPS tracking', error);
    }
  }

  async processLocationUpdate(location, isBackground = false) {
    try {
      // Apply GPS smoothing to reduce jitter (especially important for iOS)
      const smoothedLocation = this.gpsSmoother.smoothLocation(location);
      
      const { coords, timestamp } = location;
      const user = await databaseService.getUser();
      
      if (!user) {
        return;
      }

      // Use smoothed coordinates for better accuracy
      const smoothedCoords = {
        latitude: smoothedLocation.latitude,
        longitude: smoothedLocation.longitude,
        accuracy: this.sanitizeNonNegative(smoothedLocation.accuracy, 0),
        speed: this.sanitizeNonNegative(smoothedLocation.speed, 0),
        heading: this.sanitizeHeading(smoothedLocation.heading),
        altitude: smoothedLocation.altitude,
      };
      const gpsConfidence = this.deriveGpsConfidence(smoothedCoords.accuracy, smoothedLocation.sampleSize || 1);
      await this.updateAdaptivePolling(smoothedCoords.accuracy);

      // Log GPS quality stats periodically
      const stats = this.gpsSmoother.getStats();
      if (stats) {
        logger.gps('GPS quality', stats);
      }

      // Authority-specific computations only when an authority is active.
      const signalDegraded = this.isSignalDegraded(smoothedCoords.accuracy);

      if (this.currentAuthority && !signalDegraded) {
        this.currentTrackInfo = await this.getCurrentTrackInfo(smoothedCoords);
        this.currentMilepost = await this.calculateCurrentMilepost(smoothedCoords);
      } else if (!this.currentAuthority) {
        this.currentTrackInfo = null;
        this.currentMilepost = null;
      }
      
      this.currentPosition = {
        latitude: smoothedCoords.latitude,
        longitude: smoothedCoords.longitude,
        accuracy: smoothedCoords.accuracy,
        satelliteCount: Number.isFinite(Number(coords?.satellites)) ? Number(coords.satellites) : null,
        speed: smoothedCoords.speed,
        heading: smoothedCoords.heading,
        altitude: smoothedCoords.altitude,
        timestamp: new Date(timestamp).toISOString(),
        milepost: this.currentMilepost,
        trackType: this.currentTrackInfo?.trackType,
        trackNumber: this.currentTrackInfo?.trackNumber,
        gpsConfidence: gpsConfidence.level,
        gpsConfidenceScore: gpsConfidence.score,
        gpsConfidenceLabel: gpsConfidence.label,
        degradedSignal: signalDegraded,
        smoothed: smoothedLocation.smoothed || false,
        sampleSize: smoothedLocation.sampleSize || 1,
      };

      // Save authority-linked logs only when authority is active.
      if (this.currentAuthority) {
        await databaseService.saveGPSLog({
          User_ID: user.user_id,
          Authority_ID: this.currentAuthority.authority_id || this.currentAuthority.id,
          Latitude: smoothedCoords.latitude,
          Longitude: smoothedCoords.longitude,
          Speed: smoothedCoords.speed,
          Heading: smoothedCoords.heading,
          Accuracy: smoothedCoords.accuracy,
          Milepost: this.currentMilepost,
          Is_Offline: isBackground,
        });
      }

      // Update Redux state
      store.dispatch(updatePosition(this.currentPosition));

      store.dispatch(updateTrackingInfo({
        milepost: this.currentMilepost,
        track: this.currentTrackInfo,
        heading: smoothedCoords.heading,
        speed: smoothedCoords.speed,
      }));

      if (this.currentAuthority) {
        if (!signalDegraded) {
          // Check boundary alerts
          await this.checkBoundaryAlerts();
          
          // Check proximity to other workers
          await this.checkProximityAlerts();
        } else {
          await this.maybeHandlePoorSignalDegradation(smoothedCoords.accuracy);
        }

        // Send authority-linked location update to backend/socket
        if (socketService.isConnected()) {
          await this.sendLocationUpdate();
        }
      }

      // Sync if needed
      await this.syncIfNeeded();

    } catch (error) {
      logger.error('GPS', 'Failed to process location update', error);
    }
  }

  async getCurrentTrackInfo(coords) {
    try {
      if (!this.currentAuthority) return null;

      // Query local database for nearest track segment
      const query = `
        SELECT 
          track_type,
          track_number,
          bmp,
          emp,
          asset_name
        FROM tracks 
        WHERE subdivision_id = ? 
          AND latitude IS NOT NULL 
          AND longitude IS NOT NULL
        ORDER BY 
          ABS(latitude - ?) + ABS(longitude - ?)
        LIMIT 1
      `;

      const result = await databaseService.executeQuery(query, [
        this.currentAuthority.subdivision_id,
        coords.latitude,
        coords.longitude
      ]);

      if (result.rows.length > 0) {
        return result.rows.item(0);
      }

      return null;
    } catch (error) {
      logger.error('GPS', 'Error getting track info', error);
      return null;
    }
  }

  async calculateCurrentMilepost(coords) {
    try {
      if (!this.currentAuthority) return null;

      // First try to get milepost from track geometry
      if (this.currentTrackInfo) {
        // Interpolate between BMP and EMP based on position
        const { bmp, emp } = this.currentTrackInfo;
        
        // Get nearest mileposts for more accurate calculation
          const mileposts = await databaseService.executeQuery(
            `SELECT mp, latitude, longitude 
             FROM milepost_geometry 
             WHERE subdivision_id = ? 
             ORDER BY ABS(latitude - ?) + ABS(longitude - ?) 
             LIMIT 2`,
            [this.currentAuthority.subdivision_id, coords.latitude, coords.longitude]
          );

          if (mileposts.rows.length >= 2) {
            const mp1 = mileposts.rows.item(0);
            const mp2 = mileposts.rows.item(1);

            // Project current position onto the segment between the two nearest mileposts
            // Use an equirectangular approximation for small distances to improve interpolation
            const proj = this.projectOntoSegment(
              { lat: coords.latitude, lng: coords.longitude },
              { lat: mp1.latitude, lng: mp1.longitude },
              { lat: mp2.latitude, lng: mp2.longitude }
            );

            if (proj && typeof proj.t === 'number') {
              const mpValue = parseFloat(mp1.mp) + proj.t * (parseFloat(mp2.mp) - parseFloat(mp1.mp));
              return mpValue.toFixed(2);
            }
          }
        
        // Fallback to track segment interpolation
        if (bmp && emp) {
          // Simple linear interpolation (for demo)
          // In production, this should use actual track geometry
          return ((parseFloat(bmp) + parseFloat(emp)) / 2).toFixed(2);
        }
      }

      return null;
    } catch (error) {
      logger.error('GPS', 'Error calculating milepost', error);
      return null;
    }
  }

  // Helpers: small-distance projection using equirectangular approximation
  projectOntoSegment(point, segA, segB) {
    const R = 6371000; // Earth radius meters

    // Convert lat/lng to meters using origin at segA.lat
    const toMeters = (lat, lng, lat0) => {
      const x = (lng * Math.PI / 180) * R * Math.cos(lat0 * Math.PI / 180);
      const y = (lat * Math.PI / 180) * R;
      return { x, y };
    };

    const lat0 = segA.lat;
    const p = toMeters(point.lat, point.lng, lat0);
    const a = toMeters(segA.lat, segA.lng, lat0);
    const b = toMeters(segB.lat, segB.lng, lat0);

    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const wx = p.x - a.x;
    const wy = p.y - a.y;

    const vlen2 = vx * vx + vy * vy;
    if (vlen2 === 0) return null;

    const t = (wx * vx + wy * vy) / vlen2;

    // clamp t to segment
    const tClamped = Math.max(0, Math.min(1, t));

    const projX = a.x + vx * tClamped;
    const projY = a.y + vy * tClamped;

    const dx = p.x - projX;
    const dy = p.y - projY;
    const distanceFromSegment = Math.sqrt(dx * dx + dy * dy);

    return { t: tClamped, distance: distanceFromSegment };
  }

  async checkBoundaryAlerts() {
    if (!this.currentAuthority || !this.currentMilepost) return;

    const beginMP = parseFloat(this.currentAuthority.begin_mp ?? this.currentAuthority.Begin_MP);
    const endMP = parseFloat(this.currentAuthority.end_mp ?? this.currentAuthority.End_MP);
    const currentMP = parseFloat(this.currentMilepost);

    if (!Number.isFinite(beginMP) || !Number.isFinite(endMP) || !Number.isFinite(currentMP)) {
      return;
    }
    
    const distanceToBegin = Math.abs(currentMP - beginMP);
    const distanceToEnd = Math.abs(currentMP - endMP);
    const minDistance = Math.min(distanceToBegin, distanceToEnd);
    const boundary = distanceToBegin < distanceToEnd ? 'begin' : 'end';

    const authorityId = this.currentAuthority.authority_id || this.currentAuthority.Authority_ID || this.currentAuthority.id;
    const alertConfigs = await this.getBoundaryAlertConfigs();

    for (let i = 0; i < alertConfigs.length; i++) {
      const config = alertConfigs[i];
      const threshold = Number(config.distance_miles ?? config.Distance_Miles);
      if (!Number.isFinite(threshold)) {
        continue;
      }

      const alertKey = `boundary_${authorityId}_${boundary}_${threshold}`;
      const inZone = minDistance <= threshold;

      if (!inZone) {
        this.boundaryAlertState.delete(alertKey);
        continue;
      }

      const repeatMinutes = Number(config.time_minutes ?? config.Time_Minutes);
      const repeatIntervalMs = Number.isFinite(repeatMinutes) && repeatMinutes > 0
        ? repeatMinutes * 60 * 1000
        : 60 * 1000;

      const lastSentAt = this.boundaryAlertState.get(alertKey) || 0;
      const now = Date.now();
      if ((now - lastSentAt) >= repeatIntervalMs) {
        this.boundaryAlertState.set(alertKey, now);

        const level = String(config.alert_level ?? config.Alert_Level ?? 'warning').toLowerCase();
        await this.sendLocalAlert({
          type: 'BOUNDARY_ALERT',
          level,
          title: `${level.toUpperCase()} Boundary Alert`,
          message: `Approaching ${boundary} boundary (${minDistance.toFixed(2)} miles)`,
          data: {
            authorityId,
            boundary,
            distance: minDistance,
            alertThreshold: threshold,
            repeatIntervalMs,
            milepost: this.currentMilepost
          }
        });
      }

      // Only evaluate the closest matched threshold to avoid multi-alert bursts.
      break;
    }
  }

  async startForegroundWatch(profileName = 'good') {
    const profile = GPS_ADAPTIVE_PROFILES[profileName] || GPS_ADAPTIVE_PROFILES.good;
    this.activeWatchProfile = profileName;
    this.lastAdaptiveWatchUpdateAt = Date.now();

    this.watchId = await Location.watchPositionAsync(
      {
        accuracy: profile.accuracyMode,
        distanceInterval: profile.distanceInterval,
        timeInterval: profile.timeInterval,
      },
      (location) => {
        this.processLocationUpdate(location, false);
      }
    );
  }

  async updateAdaptivePolling(accuracy) {
    if (!this.isTracking || !this.watchId) return;

    const nextProfile = this.getAdaptiveProfileName(accuracy);
    if (nextProfile === this.activeWatchProfile) return;

    const now = Date.now();
    if (now - this.lastAdaptiveWatchUpdateAt < GPS_ADAPTIVE_RECONFIGURE_INTERVAL_MS) {
      return;
    }

    try {
      this.watchId.remove();
      this.watchId = null;
      await this.startForegroundWatch(nextProfile);
      logger.gps('Adaptive polling profile updated', { profile: nextProfile, accuracy });
    } catch (error) {
      logger.warn('GPS', 'Failed to update adaptive polling profile', error);
    }
  }

  async getBoundaryAlertConfigs() {
    const agencyId = this.currentAuthority?.agency_id ?? this.currentAuthority?.Agency_ID;
    if (!agencyId) {
      return [];
    }

    const now = Date.now();
    if (
      this.boundaryConfigCache.agencyId === agencyId &&
      (now - this.boundaryConfigCache.fetchedAt) < 30000 &&
      this.boundaryConfigCache.configs.length > 0
    ) {
      return this.boundaryConfigCache.configs;
    }

    let configs = [];

    try {
      const localConfigs = await databaseService.executeQuery(`
        SELECT * FROM alert_configurations
        WHERE agency_id = ?
          AND config_type = 'Boundary_Alert'
          AND is_active = 1
        ORDER BY distance_miles ASC
      `, [agencyId]);

      if (localConfigs?.rows?.length > 0) {
        for (let i = 0; i < localConfigs.rows.length; i++) {
          configs.push(localConfigs.rows.item(i));
        }
      }
    } catch (error) {
      logger.warn('GPS', 'Failed to read local boundary alert configs', error);
    }

    if (!configs.length) {
      try {
        const response = await apiService.getAlertConfigurations(agencyId);
        const allConfigs = response?.data?.configurations || [];
        configs = allConfigs.filter((cfg) => {
          const configType = cfg.config_type ?? cfg.Config_Type;
          const isActive = cfg.is_active ?? cfg.Is_Active;
          return configType === 'Boundary_Alert' && (isActive === 1 || isActive === true);
        });
      } catch (error) {
        logger.warn('GPS', 'Failed to fetch boundary alert configs from API', error);
      }
    }

    configs.sort((a, b) => {
      const da = Number(a.distance_miles ?? a.Distance_Miles ?? Number.POSITIVE_INFINITY);
      const db = Number(b.distance_miles ?? b.Distance_Miles ?? Number.POSITIVE_INFINITY);
      return da - db;
    });

    this.boundaryConfigCache = {
      agencyId,
      fetchedAt: now,
      configs
    };

    return configs;
  }

  async checkProximityAlerts() {
    if (!this.currentPosition) return;

    // If online, use server-based proximity checking
    if (socketService.isConnected()) {
      // Request proximity check from server via socket
      socketService.emit('check-proximity', {
        authorityId: this.currentAuthority?.authority_id || this.currentAuthority?.id,
        latitude: this.currentPosition.latitude,
        longitude: this.currentPosition.longitude,
        subdivisionId: this.currentAuthority?.subdivision_id,
        agencyId: this.currentAuthority?.agency_id,
        timestamp: new Date().toISOString()
      });
    } else {
      // If offline, perform local proximity checking
      await this.checkLocalProximityAlerts();
    }
  }

  async checkLocalProximityAlerts() {
    try {
      if (!this.currentAuthority || !this.currentPosition) return;

      // Get other active authorities from local database (cached data)
      const otherAuthorities = await databaseService.executeQuery(`
        SELECT 
          a.*,
          g.latitude as last_latitude,
          g.longitude as last_longitude,
          g.created_at as last_update
        FROM authorities a
        LEFT JOIN (
          SELECT authority_id, latitude, longitude, created_at
          FROM gps_logs
          WHERE (authority_id, created_at) IN (
            SELECT authority_id, MAX(created_at)
            FROM gps_logs
            GROUP BY authority_id
          )
        ) g ON a.authority_id = g.authority_id
        WHERE a.subdivision_id = ?
          AND a.track_type = ?
          AND a.track_number = ?
          AND a.status = 'Active'
          AND a.authority_id != ?
          AND g.latitude IS NOT NULL
          AND g.longitude IS NOT NULL
      `, [
        this.currentAuthority.subdivision_id,
        this.currentAuthority.track_type,
        this.currentAuthority.track_number,
        this.currentAuthority.authority_id || this.currentAuthority.id
      ]);

      if (!otherAuthorities.rows || otherAuthorities.rows.length === 0) {
        return;
      }

      // Get proximity alert configurations
      const proximityConfigs = await databaseService.executeQuery(`
        SELECT * FROM alert_configurations 
        WHERE agency_id = ? 
          AND config_type = 'Proximity_Alert'
          AND is_active = 1
        ORDER BY distance_miles ASC
      `, [this.currentAuthority.agency_id]);

      // Check distance to each other authority
      for (let i = 0; i < otherAuthorities.rows.length; i++) {
        const other = otherAuthorities.rows.item(i);
        
        const distance = this.calculateDistance(
          this.currentPosition.latitude,
          this.currentPosition.longitude,
          other.last_latitude,
          other.last_longitude
        );

        // Check against each proximity threshold
        for (let j = 0; j < proximityConfigs.rows.length; j++) {
          const config = proximityConfigs.rows.item(j);
          const alertKey = `proximity_${other.authority_id}_${config.distance_miles}`;
          
          if (distance <= config.distance_miles) {
            if (!this.sentAlerts.has(alertKey)) {
              this.sentAlerts.set(alertKey, true);
              
              await this.sendLocalAlert({
                type: 'PROXIMITY_ALERT',
                level: config.alert_level,
                title: `${config.alert_level.toUpperCase()} Proximity Alert`,
                message: `Another worker (${other.employee_name_display || 'Unknown'}) is ${distance.toFixed(2)} miles away on the same track`,
                data: {
                  authorityId: this.currentAuthority.authority_id || this.currentAuthority.id,
                  otherAuthorityId: other.authority_id,
                  otherEmployeeName: other.employee_name_display,
                  otherEmployeeContact: other.employee_contact_display,
                  distance: distance,
                  alertThreshold: config.distance_miles,
                  isOffline: true
                }
              });

              // Show additional info in notification
              logger.gps('OFFLINE PROXIMITY ALERT', {
                worker: other.employee_name_display,
                contact: other.employee_contact_display,
                distance: distance.toFixed(2),
                threshold: config.distance_miles,
                lastUpdate: other.last_update
              });
            }
            break; // Only show the closest threshold alert
          }
        }
      }
    } catch (error) {
      logger.error('GPS', 'Error checking local proximity alerts', error);
    }
  }

  async sendLocationUpdate() {
    if (!this.currentPosition || !this.currentAuthority) return;
    if (!this.shouldSendBackendUpdate()) return;

    const user = await databaseService.getUser();
    
    const gpsData = {
      userId: user?.user_id,
      authorityId: this.currentAuthority.Authority_ID || this.currentAuthority.authority_id || this.currentAuthority.id,
      latitude: this.currentPosition.latitude,
      longitude: this.currentPosition.longitude,
      speed: this.sanitizeNonNegative(this.currentPosition.speed, 0),
      heading: this.sanitizeHeading(this.currentPosition.heading),
      accuracy: this.sanitizeNonNegative(this.currentPosition.accuracy, 0),
      satelliteCount: this.currentPosition.satelliteCount,
      hasSignal: Number.isFinite(Number(this.currentPosition.accuracy)) && Number(this.currentPosition.accuracy) > 0,
      timestamp: this.currentPosition.timestamp,
      isOffline: false
    };

    // Send to backend API for alert processing
    try {
      await apiService.updateGPSPosition(gpsData);
      this.lastBackendSendAt = Date.now();
      this.lastBackendSentPosition = {
        latitude: this.currentPosition.latitude,
        longitude: this.currentPosition.longitude,
      };
      logger.gps('GPS position sent to backend for alert processing');
    } catch (error) {
      logger.error('GPS', 'Failed to send GPS to backend', error);
      // Queue for sync if offline
      gpsData.isOffline = true;
    }

    // Also send via socket for real-time updates
    if (socketService.isConnected()) {
      socketService.emit('location-update', {
        ...gpsData,
        agencyId: user?.Agency_ID || this.currentAuthority.agency_id,
        subdivisionId: this.currentAuthority?.Subdivision_ID || this.currentAuthority?.subdivision_id || null,
        trackType: this.currentTrackInfo?.track_type || this.currentAuthority?.Track_Type || this.currentAuthority?.track_type || null,
        trackNumber: this.currentTrackInfo?.track_number || this.currentAuthority?.Track_Number || this.currentAuthority?.track_number || null,
        role: user?.Role || user?.role || null,
        milepost: this.currentMilepost,
        timestamp: this.currentPosition.timestamp
      });
    } else {
      logger.warn('GPS', 'Socket not connected, location update not sent via socket');
    }
  }

  async sendLocalAlert(alertData) {
    try {
      const user = await databaseService.getUser();
      
      if (user) {
        // Save to local database
        await databaseService.saveAlert({
          User_ID: user.user_id,
          Authority_ID: this.currentAuthority?.authority_id || this.currentAuthority?.id,
          Alert_Type: alertData.type,
          Alert_Level: alertData.level,
          Message: alertData.message,
          Triggered_Distance: alertData.data?.distance,
          Is_Delivered: 1,
          Delivered_Time: new Date().toISOString(),
          Is_Read: 0
        });

        // Update Redux state
        store.dispatch({
          type: 'alerts/addAlert',
          payload: alertData,
        });

        // For proximity alerts, show contact information
        if (alertData.type === 'PROXIMITY_ALERT' && alertData.data) {
          const message = alertData.data.isOffline 
            ? `${alertData.message}\n\n⚠️ OFFLINE MODE - Using cached location data\n\nContact: ${alertData.data.otherEmployeeName}\nPhone: ${alertData.data.otherEmployeeContact}`
            : `${alertData.message}\n\nContact: ${alertData.data.otherEmployeeName}\nPhone: ${alertData.data.otherEmployeeContact}`;

          Alert.alert(
            alertData.title,
            message,
            [
              {
                text: 'Dismiss',
                style: 'cancel'
              },
              {
                text: 'Call',
                onPress: () => {
                  if (alertData.data.otherEmployeeContact) {
                    Linking.openURL(`tel:${alertData.data.otherEmployeeContact}`);
                  }
                }
              }
            ]
          );
        } else if (alertData.type === 'GPS_DEGRADED') {
          // Avoid interruptive popups for degraded signal; keep it in alert feed/state.
          logger.warn('GPS', alertData.message, alertData.data || {});
        } else {
          // Show native alert for other alert types
          Alert.alert(
            alertData.title,
            alertData.message,
            [{ text: 'OK', onPress: () => {} }]
          );
        }
      }
    } catch (error) {
      logger.error('GPS', 'Failed to send local alert', error);
    }
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 3958.8; // Earth's radius in miles
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  toRad(degrees) {
    return degrees * (Math.PI / 180);
  }

  async syncIfNeeded() {
    try {
      const now = Date.now();
      if (this.lastSyncTime && now - this.lastSyncTime < 30000) {
        return;
      }

      // Sync pending GPS logs
      const pendingLogs = await databaseService.getPendingGPSLogs(50);
      
      if (pendingLogs.length > 0) {
        const netState = await NetInfo.fetch();
        if (netState?.isConnected && netState?.isInternetReachable) {
          logger.gps(`Syncing ${pendingLogs.length} GPS logs on reconnect...`);
          await syncService.forceSync();
        }
      }

      this.lastSyncTime = now;
    } catch (error) {
      logger.error('GPS', 'GPS sync failed', error);
    }
  }

  getCurrentPosition() {
    return this.currentPosition;
  }

  getCurrentMilepost() {
    return this.currentMilepost;
  }

  getCurrentTrackInfo() {
    return this.currentTrackInfo;
  }

  isTracking() {
    return this.isTracking;
  }

  getCurrentAuthority() {
    return this.currentAuthority;
  }

  async cleanup() {
    await this.stopTracking();
    if (this.netInfoUnsubscribe) {
      this.netInfoUnsubscribe();
      this.netInfoUnsubscribe = null;
    }
  }
}

const gpsTrackingService = new GPSTrackingService();
export default gpsTrackingService;
