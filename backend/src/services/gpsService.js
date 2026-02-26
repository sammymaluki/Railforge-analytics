const Authority = require('../models/Authority');
const AlertService = require('./alertService');
const { logger } = require('../config/logger');
const { getConnectionWithRecovery, sql } = require('../config/database');
const {
  calculateMilepostFromGeometry,
  calculateTrackDistance
} = require('../utils/geoCalculations');
const { getGpsAccuracyMonitoringConfig, getGpsSafetyAlertConfig } = require('./agencyConfigService');
const { logAuditEvent } = require('./auditEventService');
const { emitToUser } = require('../config/socket');

const TRANSIENT_DB_CODES = new Set(['ESOCKET', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT']);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_MILEPOST_MATCH_DISTANCE_MILES = 2.0;

const isTransientDbError = (error) => {
  if (!error) return false;
  if (error.code && TRANSIENT_DB_CODES.has(error.code)) return true;
  const message = String(error.message || '').toLowerCase();
  return (
    message.includes('connection lost') ||
    message.includes('econnreset') ||
    message.includes('failed to connect') ||
    message.includes('timeout') ||
    message.includes('aborted')
  );
};

const queryWithRetry = async (requestFactory, query, context, maxRetries = 5) => {
  let lastError;
  let forceReconnect = false;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const pool = await getConnectionWithRecovery({ forceReconnect });
      const request = requestFactory(pool);
      forceReconnect = false;
      return await request.query(query);
    } catch (error) {
      lastError = error;
      if (!isTransientDbError(error) || attempt >= maxRetries) {
        throw error;
      }

      forceReconnect = true;
      const delay = 200 * (2 ** (attempt - 1));
      logger.warn(`GPS query attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms`, {
        context,
        error: error.message
      });
      // eslint-disable-next-line no-await-in-loop
      await sleep(delay);
    }
  }

  throw lastError;
};

class GPSService {
  constructor() {
    this.userPositions = new Map(); // Track last known positions
    this.updateInterval = 30000; // 30 seconds for boundary checks
    this.authorityCache = new Map();
    this.authorityCacheTtlMs = 15000;
    this.gpsAccuracyAuditState = new Map();
    this.gpsSafetyAlertState = new Map();
    this.locationReliabilityState = new Map();
  }

  async getAuthoritySnapshot(authorityId) {
    const now = Date.now();
    const cached = this.authorityCache.get(authorityId);
    if (cached && now - cached.cachedAt < this.authorityCacheTtlMs) {
      return cached.authority;
    }

    try {
      const authority = await Authority.getAuthorityById(authorityId);
      if (authority) {
        this.authorityCache.set(authorityId, {
          authority,
          cachedAt: now,
        });
      }
      return authority;
    } catch (error) {
      // If transient lookup fails, continue with the last known snapshot.
      if (cached?.authority) {
        logger.warn('Using cached authority snapshot after lookup failure', {
          authorityId,
          error: error.message,
        });
        return cached.authority;
      }
      throw error;
    }
  }

  async processGPSUpdate(gpsData) {
    const { userId, authorityId, latitude, longitude } = gpsData;

    try {
      // Store last position
      this.userPositions.set(userId, {
        latitude,
        longitude,
        timestamp: Date.now(),
        authorityId
      });

      // Log GPS data
      await this.logGPSPosition(gpsData);

      // Get authority details
      const authority = await this.getAuthoritySnapshot(authorityId);
      
      if (!authority || !authority.Is_Active) {
        return { logged: true, authority: null };
      }

      await this.logGpsAccuracyDegradation(gpsData, authority);
      const gpsSafetyState = await this.evaluateGpsSafety(gpsData, authority);

      // Calculate milepost using geometry
      const milepostData = await this.calculateMilepost(
        authority.Subdivision_ID,
        latitude,
        longitude
      );

      if (milepostData && milepostData.milepost !== null) {
        const currentMP = milepostData.milepost;

        // Check boundary alerts using track-based distance
        const boundaryDistances = await this.calculateDistanceToAuthorityBoundary(
          authority,
          currentMP
        );

        if (!gpsSafetyState.pauseAuthorityAlerts) {
          const boundaryAlerts = await AlertService.checkBoundaryAlerts(
            authority,
            currentMP,
            latitude,
            longitude,
            boundaryDistances
          );

          if (boundaryAlerts.length > 0 && authority.User_ID) {
            await AlertService.sendBoundaryAlerts(
              authority.User_ID,
              authority.Authority_ID,
              boundaryAlerts
            );
          }
        }

        // Check proximity to other workers
        const proximityData = await Authority.checkProximity(
          authorityId,
          latitude,
          longitude,
          1.0 // 1 mile max distance for proximity check
        );

        if (proximityData && proximityData.length > 0) {
          await AlertService.checkProximityAlerts(authority, proximityData);
        }

        logger.debug(`GPS processed for user ${userId}, authority ${authorityId}, MP: ${currentMP}`);

        return {
          logged: true,
          milepost: milepostData,
          boundaryDistances,
          locationReliability: {
            isUnreliable: gpsSafetyState.isUnreliable,
            reasons: gpsSafetyState.reasons,
            pauseAuthorityAlerts: gpsSafetyState.pauseAuthorityAlerts,
          }
        };
      }

      return {
        logged: true,
        milepost: null,
        locationReliability: {
          isUnreliable: gpsSafetyState.isUnreliable,
          reasons: gpsSafetyState.reasons,
          pauseAuthorityAlerts: gpsSafetyState.pauseAuthorityAlerts,
        }
      };

    } catch (error) {
      logger.error('Process GPS update error:', error);
      return { logged: false, error: error.message };
    }
  }

  async logGPSPosition(gpsData) {
    try {
      const query = `
        INSERT INTO GPS_Logs (
          User_ID, Authority_ID, Latitude, Longitude,
          Speed, Heading, Accuracy, Is_Offline, Sync_Status
        )
        OUTPUT INSERTED.*
        VALUES (
          @userId, @authorityId, @latitude, @longitude,
          @speed, @heading, @accuracy, @isOffline, 'Synced'
        )
      `;

      const result = await queryWithRetry(
        (pool) => pool.request()
          .input('userId', sql.Int, gpsData.userId)
          .input('authorityId', sql.Int, gpsData.authorityId)
          .input('latitude', sql.Decimal(10, 8), gpsData.latitude)
          .input('longitude', sql.Decimal(11, 8), gpsData.longitude)
          .input('speed', sql.Decimal(5, 2), gpsData.speed)
          .input('heading', sql.Decimal(5, 2), gpsData.heading)
          .input('accuracy', sql.Decimal(5, 2), gpsData.accuracy)
          .input('isOffline', sql.Bit, gpsData.isOffline ? 1 : 0),
        query,
        'logGPSPosition.insert'
      );

      return result.recordset[0];

    } catch (error) {
      logger.error('Log GPS position error:', error);
      
      // Try to log in sync queue for offline retry
      if (gpsData.isOffline) {
        await this.queueForSync(gpsData);
      }
      
      throw error;
    }
  }

  async calculateMilepost(subdivisionId, latitude, longitude) {
    try {
      // Get all milepost geometry for this subdivision
      const query = `
        SELECT MP, Latitude, Longitude, Track_Type, Track_Number
        FROM Milepost_Geometry
        WHERE Subdivision_ID = @subdivisionId
          AND Is_Active = 1
        ORDER BY MP
      `;
      
      const result = await queryWithRetry(
        (pool) => pool.request()
          .input('subdivisionId', sql.Int, subdivisionId),
        query,
        'calculateMilepost.loadGeometry'
      );
      
      if (result.recordset.length === 0) {
        logger.warn(`No milepost geometry found for subdivision ${subdivisionId}`);
        return null;
      }

      // Use advanced geometry calculation
      const milepostData = calculateMilepostFromGeometry(
        latitude,
        longitude,
        result.recordset
      );

      if (!milepostData) {
        return null;
      }

      // Log if user is far from track
      if (milepostData.distanceFromTrack > 0.1) {
        logger.warn(`User position is ${milepostData.distanceFromTrack.toFixed(2)} miles from track`);
      }

      // If we are clearly far off the corridor, avoid publishing a false milepost.
      if (milepostData.distanceFromTrack > MAX_MILEPOST_MATCH_DISTANCE_MILES) {
        return null;
      }

      return {
        milepost: milepostData.milepost,
        confidence: milepostData.confidence,
        distanceFromTrack: milepostData.distanceFromTrack,
        trackType: milepostData.nearestGeometry?.Track_Type,
        trackNumber: milepostData.nearestGeometry?.Track_Number
      };
      
    } catch (error) {
      logger.error('Calculate milepost error:', error);
      return null;
    }
  }

  /**
   * Calculate track-based distance between two points
   */
  async calculateTrackDistanceBetween(subdivisionId, mp1, mp2) {
    try {
      // Get milepost geometry
      const query = `
        SELECT MP, Latitude, Longitude
        FROM Milepost_Geometry
        WHERE Subdivision_ID = @subdivisionId
          AND Is_Active = 1
          AND MP BETWEEN @minMP AND @maxMP
        ORDER BY MP
      `;
      
      const minMP = Math.min(mp1, mp2);
      const maxMP = Math.max(mp1, mp2);
      
      const result = await queryWithRetry(
        (pool) => pool.request()
          .input('subdivisionId', sql.Int, subdivisionId)
          .input('minMP', sql.Decimal(10, 4), minMP)
          .input('maxMP', sql.Decimal(10, 4), maxMP),
        query,
        'calculateTrackDistanceBetween.loadGeometry'
      );
      
      if (result.recordset.length === 0) {
        // Fall back to simple milepost difference
        return Math.abs(mp2 - mp1);
      }

      // Calculate actual track distance
      const trackDistance = calculateTrackDistance(mp1, mp2, result.recordset);
      
      return trackDistance;
      
    } catch (error) {
      logger.error('Calculate track distance error:', error);
      // Fall back to simple difference
      return Math.abs(mp2 - mp1);
    }
  }

  /**
   * Calculate distance to authority boundary using track geometry
   */
  async calculateDistanceToAuthorityBoundary(authority, currentMP) {
    try {
      const beginDistance = await this.calculateTrackDistanceBetween(
        authority.Subdivision_ID,
        currentMP,
        authority.Begin_MP
      );

      const endDistance = await this.calculateTrackDistanceBetween(
        authority.Subdivision_ID,
        currentMP,
        authority.End_MP
      );

      return {
        distanceToBegin: beginDistance,
        distanceToEnd: endDistance,
        nearestBoundary: Math.min(beginDistance, endDistance),
        isApproachingBegin: currentMP < authority.Begin_MP,
        isApproachingEnd: currentMP > authority.End_MP
      };
      
    } catch (error) {
      logger.error('Calculate boundary distance error:', error);
      return null;
    }
  }

  async queueForSync(gpsData) {
    try {
      // Get device ID for user
      const deviceQuery = `
        SELECT TOP 1 Device_ID 
        FROM Mobile_Devices 
        WHERE User_ID = @userId AND Is_Active = 1
      `;
      
      const deviceResult = await queryWithRetry(
        (pool) => pool.request()
          .input('userId', sql.Int, gpsData.userId),
        deviceQuery,
        'queueForSync.getDevice'
      );
      
      if (deviceResult.recordset.length === 0) {
        return;
      }
      
      const deviceId = deviceResult.recordset[0].Device_ID;
      
      // Queue for sync
      await queryWithRetry(
        (pool) => pool.request()
          .input('deviceId', sql.Int, deviceId)
          .input('tableName', sql.NVarChar, 'GPS_Logs')
          .input('recordId', sql.Int, 0) // Will be set on sync
          .input('operation', sql.NVarChar, 'INSERT')
          .input('syncData', sql.NVarChar, JSON.stringify(gpsData)),
        `
          INSERT INTO Data_Sync_Queue (Device_ID, Table_Name, Record_ID, Operation, Sync_Data)
          VALUES (@deviceId, @tableName, @recordId, @operation, @syncData)
        `,
        'queueForSync.insert'
      );
      
      logger.debug(`GPS data queued for sync for user ${gpsData.userId}`);
      
    } catch (error) {
      logger.error('Queue for sync error:', error);
    }
  }

  async getUserPosition(userId) {
    return this.userPositions.get(userId);
  }

  async getAllActivePositions() {
    const positions = [];
    
    for (const [userId, position] of this.userPositions.entries()) {
      // Only include positions from last 5 minutes
      if (Date.now() - position.timestamp < 5 * 60 * 1000) {
        positions.push({
          userId,
          ...position
        });
      }
    }
    
    return positions;
  }

  async cleanupOldPositions() {
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    
    for (const [userId, position] of this.userPositions.entries()) {
      if (position.timestamp < fiveMinutesAgo) {
        this.userPositions.delete(userId);
      }
    }
  }

  getGpsSafetyKey(userId, authorityId) {
    return `${Number(userId) || 0}:${Number(authorityId) || 0}`;
  }

  shouldEmitGpsSafetyAlert(key, alertType, repeatFrequencySeconds) {
    const stateKey = `${key}:${alertType}`;
    const now = Date.now();
    const lastSentAt = this.gpsSafetyAlertState.get(stateKey) || 0;
    const repeatMs = Math.max(1000, Number(repeatFrequencySeconds || 30) * 1000);

    if (!lastSentAt || (now - lastSentAt) >= repeatMs) {
      this.gpsSafetyAlertState.set(stateKey, now);
      return true;
    }

    return false;
  }

  async createGpsSafetyAlertLog(userId, authorityId, alertType, level, message, distance = null) {
    try {
      const normalizedType = String(alertType || '').toUpperCase();
      let dbAlertType = 'GPS_Accuracy';
      if (normalizedType.includes('STALE')) dbAlertType = 'GPS_Stale';
      if (normalizedType.includes('SIGNAL')) dbAlertType = 'GPS_Signal_Lost';
      if (normalizedType.includes('ACCURACY')) dbAlertType = 'GPS_Accuracy';
      if (normalizedType.includes('UNRELIABLE')) dbAlertType = 'Location_Unreliable';

      await queryWithRetry(
        (pool) => pool.request()
          .input('userId', sql.Int, Number(userId))
          .input('authorityId', sql.Int, Number.isFinite(Number(authorityId)) ? Number(authorityId) : null)
          .input('alertType', sql.VarChar(50), dbAlertType)
          .input('alertLevel', sql.VarChar(20), String(level || 'Warning'))
          .input('triggeredDistance', sql.Decimal(5, 2), Number.isFinite(Number(distance)) ? Number(distance) : null)
          .input('message', sql.NVarChar(500), String(message || 'GPS safety alert')),
        `
          INSERT INTO Alert_Logs (
            User_ID,
            Authority_ID,
            Alert_Type,
            Alert_Level,
            Triggered_Distance,
            Message,
            Is_Delivered,
            Delivered_Time,
            Is_Read,
            Created_Date
          )
          VALUES (
            @userId,
            @authorityId,
            @alertType,
            @alertLevel,
            @triggeredDistance,
            @message,
            1,
            GETDATE(),
            0,
            GETDATE()
          )
        `,
        'createGpsSafetyAlertLog.insert'
      );
    } catch (error) {
      logger.error('Create GPS safety alert log error:', error);
    }
  }

  async emitGpsSafetyAlert(userId, authorityId, agencyId, payload, config, auditContext = null) {
    try {
      const key = this.getGpsSafetyKey(userId, authorityId);
      const repeatFrequencySeconds = config?.repeatFrequencySeconds || 30;
      if (!this.shouldEmitGpsSafetyAlert(key, payload.alertType, repeatFrequencySeconds)) {
        return;
      }

      const level = payload.level || 'warning';
      const message = payload.message || 'GPS safety alert';

      try {
        emitToUser(userId, 'gps_safety_alert', {
          type: 'GPS_SAFETY_ALERT',
          alertType: payload.alertType,
          level,
          title: payload.title || 'GPS Safety Alert',
          message,
          data: {
            authorityId,
            agencyId,
            ...payload.data,
          },
          timestamp: new Date().toISOString(),
        });
      } catch (_socketError) {
        // Socket may not be initialized in non-server contexts.
      }

      await this.createGpsSafetyAlertLog(userId, authorityId, payload.alertType, level, message);
      await logAuditEvent({
        userId,
        actionType: 'ALERT_TRIGGERED',
        tableName: 'Alert_Logs',
        recordId: Number(authorityId) || null,
        newValue: {
          source: 'GPS_SAFETY',
          alertType: payload.alertType,
          level,
          message,
          data: payload.data || {},
        },
        ipAddress: auditContext?.ipAddress,
        deviceInfo: auditContext?.deviceInfo,
      });
    } catch (error) {
      logger.error('Emit GPS safety alert error:', error);
    }
  }

  async emitLocationReliabilityState({ userId, authorityId, agencyId, isUnreliable, reasons, pauseAuthorityAlerts, auditContext = null }) {
    try {
      const key = this.getGpsSafetyKey(userId, authorityId);
      const previous = this.locationReliabilityState.get(key) || { isUnreliable: false, reasonKey: '' };
      const reasonKey = (reasons || []).sort().join('|');

      if (previous.isUnreliable === isUnreliable && previous.reasonKey === reasonKey) {
        return;
      }

      this.locationReliabilityState.set(key, { isUnreliable, reasonKey, updatedAt: Date.now() });
      if (isUnreliable) {
        await this.createGpsSafetyAlertLog(
          userId,
          authorityId,
          'LOCATION_UNRELIABLE',
          'Critical',
          `Location Unreliable mode enabled (${(reasons || []).join(', ') || 'unknown reason'})`
        );
      }

      try {
        emitToUser(userId, 'location_reliability', {
          type: 'LOCATION_RELIABILITY',
          mode: isUnreliable ? 'UNRELIABLE' : 'RELIABLE',
          pauseAuthorityAlerts: Boolean(pauseAuthorityAlerts),
          reasons: reasons || [],
          authorityId: Number(authorityId) || null,
          agencyId: Number(agencyId) || null,
          message: isUnreliable
            ? 'Location Unreliable mode enabled'
            : 'Location reliability restored',
          timestamp: new Date().toISOString(),
        });
      } catch (_socketError) {
        // Socket may not be initialized in non-server contexts.
      }

      const oldValue = previous
        ? {
          mode: previous.isUnreliable ? 'UNRELIABLE' : 'RELIABLE',
          reasons: previous.reasonKey ? previous.reasonKey.split('|') : [],
        }
        : null;

      await logAuditEvent({
        userId,
        actionType: 'LOCATION_UNRELIABLE_MODE',
        tableName: 'GPS_Logs',
        recordId: Number(authorityId) || null,
        oldValue,
        newValue: {
          mode: isUnreliable ? 'UNRELIABLE' : 'RELIABLE',
          reasons: reasons || [],
          pauseAuthorityAlerts: Boolean(pauseAuthorityAlerts),
        },
        ipAddress: auditContext?.ipAddress,
        deviceInfo: auditContext?.deviceInfo,
      });
    } catch (error) {
      logger.error('Emit location reliability state error:', error);
    }
  }

  async evaluateGpsSafety(gpsData, authority) {
    const defaultState = {
      isUnreliable: false,
      reasons: [],
      pauseAuthorityAlerts: false,
    };

    try {
      const agencyId = Number(authority?.Agency_ID);
      const userId = Number(gpsData?.userId);
      const authorityId = Number(authority?.Authority_ID);
      if (!Number.isFinite(agencyId) || !Number.isFinite(userId)) {
        return defaultState;
      }

      const config = getGpsSafetyAlertConfig(agencyId);
      if (!config.enabled) {
        await this.emitLocationReliabilityState({
          userId,
          authorityId,
          agencyId,
          isUnreliable: false,
          reasons: [],
          pauseAuthorityAlerts: false,
          auditContext: gpsData?.auditContext || null,
        });
        return defaultState;
      }

      const accuracy = Number(gpsData?.accuracy);
      const timestamp = new Date(gpsData?.timestamp || Date.now()).getTime();
      const staleForMs = Date.now() - timestamp;
      const staleSignal = staleForMs > (config.staleAfterSeconds * 1000);
      const satelliteCount = Number(gpsData?.satelliteCount);
      const explicitSignalLost = gpsData?.signalLost === true || gpsData?.hasSignal === false;
      const satelliteLoss = explicitSignalLost || (Number.isFinite(satelliteCount) && satelliteCount <= 0);

      const accuracyBreached = Number.isFinite(accuracy) && accuracy >= config.accuracyThresholdMeters;
      const criticalAccuracy = Number.isFinite(accuracy) && accuracy >= config.criticalAccuracyThresholdMeters;

      const reasons = [];
      if (accuracyBreached) reasons.push('accuracy');
      if (satelliteLoss) reasons.push('satellite_loss');
      if (staleSignal) reasons.push('stale_signal');

      if (config.alertTypes.accuracy && accuracyBreached) {
        await this.emitGpsSafetyAlert(userId, authorityId, agencyId, {
          alertType: 'GPS_ACCURACY_THRESHOLD',
          level: criticalAccuracy ? 'critical' : 'warning',
          title: criticalAccuracy ? 'Critical GPS Accuracy Alert' : 'GPS Accuracy Alert',
          message: `GPS accuracy is ${accuracy.toFixed(1)}m (threshold ${config.accuracyThresholdMeters}m)`,
          data: {
            accuracyMeters: accuracy,
            thresholdMeters: config.accuracyThresholdMeters,
            criticalThresholdMeters: config.criticalAccuracyThresholdMeters,
          },
        }, config, gpsData?.auditContext || null);
      }

      if (config.alertTypes.satelliteLoss && satelliteLoss) {
        await this.emitGpsSafetyAlert(userId, authorityId, agencyId, {
          alertType: 'GPS_SATELLITE_SIGNAL_LOST',
          level: 'critical',
          title: 'Satellite Signal Lost',
          message: 'GPS satellite signal appears lost',
          data: {
            satelliteCount: Number.isFinite(satelliteCount) ? satelliteCount : null,
            explicitSignalLost: Boolean(explicitSignalLost),
          },
        }, config, gpsData?.auditContext || null);
      }

      if (config.alertTypes.staleSignal && staleSignal) {
        await this.emitGpsSafetyAlert(userId, authorityId, agencyId, {
          alertType: 'GPS_SIGNAL_STALE',
          level: 'critical',
          title: 'GPS Signal Stale',
          message: `No reliable GPS update for ${Math.floor(staleForMs / 1000)} seconds`,
          data: {
            staleSeconds: Math.floor(staleForMs / 1000),
            thresholdSeconds: config.staleAfterSeconds,
          },
        }, config, gpsData?.auditContext || null);
      }

      const isUnreliable = reasons.length > 0;
      const pauseAuthorityAlerts = isUnreliable && config.pauseAuthorityAlertsOnLowAccuracy;

      await this.emitLocationReliabilityState({
        userId,
        authorityId,
        agencyId,
        isUnreliable,
        reasons,
        pauseAuthorityAlerts,
        auditContext: gpsData?.auditContext || null,
      });

      return {
        isUnreliable,
        reasons,
        pauseAuthorityAlerts,
      };
    } catch (error) {
      logger.error('Evaluate GPS safety error:', error);
      return defaultState;
    }
  }

  async checkStaleGpsSignals() {
    try {
      for (const [userId, position] of this.userPositions.entries()) {
        const authorityId = Number(position?.authorityId);
        if (!Number.isFinite(authorityId)) {
          continue;
        }

        const authority = await this.getAuthoritySnapshot(authorityId);
        if (!authority || !authority.Is_Active || !Number.isFinite(Number(authority.Agency_ID))) {
          continue;
        }

        const config = getGpsSafetyAlertConfig(authority.Agency_ID);
        if (!config.enabled || !config.alertTypes.staleSignal) {
          continue;
        }

        const staleMs = Date.now() - Number(position.timestamp || 0);
        if (staleMs <= config.staleAfterSeconds * 1000) {
          continue;
        }

        await this.evaluateGpsSafety({
          userId,
          authorityId,
          latitude: position.latitude,
          longitude: position.longitude,
          accuracy: null,
          timestamp: new Date(position.timestamp || Date.now()).toISOString(),
          signalLost: true,
        }, authority);
      }
    } catch (error) {
      logger.error('Check stale GPS signals error:', error);
    }
  }

  async logGpsAccuracyDegradation(gpsData, authority) {
    try {
      const agencyId = Number(authority?.Agency_ID);
      const userId = Number(gpsData?.userId);
      const accuracy = Number(gpsData?.accuracy);
      if (!Number.isFinite(agencyId) || !Number.isFinite(userId) || !Number.isFinite(accuracy)) {
        return;
      }

      const config = getGpsAccuracyMonitoringConfig(agencyId);
      if (!config.enabled) {
        return;
      }

      let severity = null;
      if (accuracy >= config.criticalThresholdMeters) {
        severity = 'critical';
      } else if (accuracy >= config.degradedThresholdMeters) {
        severity = 'degraded';
      }

      const key = `${userId}:${authority.Authority_ID || 0}`;
      const previous = this.gpsAccuracyAuditState.get(key) || null;
      const now = Date.now();
      const minIntervalMs = config.minIntervalSeconds * 1000;

      if (!severity) {
        if (previous?.severity) {
          this.gpsAccuracyAuditState.set(key, { severity: null, lastLoggedAt: now });
        }
        return;
      }

      const shouldLog = !previous ||
        previous.severity !== severity ||
        (now - (previous.lastLoggedAt || 0) >= minIntervalMs);

      if (!shouldLog) {
        return;
      }

      const auditContext = gpsData?.auditContext || null;
      const oldValue = previous?.severity
        ? { severity: previous.severity }
        : null;

      await logAuditEvent({
        userId,
        actionType: 'GPS_ACCURACY_DEGRADED',
        tableName: 'GPS_Logs',
        recordId: Number(authority.Authority_ID) || null,
        oldValue,
        newValue: {
          severity,
          accuracyMeters: accuracy,
          degradedThresholdMeters: config.degradedThresholdMeters,
          criticalThresholdMeters: config.criticalThresholdMeters,
          latitude: gpsData.latitude,
          longitude: gpsData.longitude,
        },
        ipAddress: auditContext?.ipAddress,
        deviceInfo: auditContext?.deviceInfo,
      });

      this.gpsAccuracyAuditState.set(key, { severity, lastLoggedAt: now });
    } catch (error) {
      logger.error('Log GPS accuracy degradation error:', error);
    }
  }
}

// Create singleton instance
const gpsService = new GPSService();

// Schedule cleanup every minute
setInterval(() => {
  gpsService.cleanupOldPositions();
}, 60 * 1000);

setInterval(() => {
  gpsService.checkStaleGpsSignals();
}, 10 * 1000);

module.exports = gpsService;
