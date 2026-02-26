const DEFAULT_FIELD_CONFIGURATIONS = {
  authorityType: {
    label: 'Authority Type',
    required: true,
    enabled: true,
    options: [
      'Foul Time',
      'Maintenance Window',
      'Emergency Work',
      'Inspection',
      'Construction',
      'Signal Work',
      'Track Work',
      'Other'
    ]
  },
  subdivision: {
    label: 'Subdivision',
    required: true,
    enabled: true
  },
  beginMP: {
    label: 'Begin Milepost',
    required: true,
    enabled: true,
    format: 'decimal',
    minValue: 0,
    decimalPlaces: 4
  },
  endMP: {
    label: 'End Milepost',
    required: true,
    enabled: true,
    format: 'decimal',
    minValue: 0,
    decimalPlaces: 4
  },
  lineSegment: {
    label: 'Line Segment',
    required: false,
    enabled: true,
    options: []
  },
  trackType: {
    label: 'Track Type',
    required: true,
    enabled: true,
    options: ['Main', 'Siding', 'Yard', 'Industrial', 'Other']
  },
  trackNumber: {
    label: 'Track Number',
    required: true,
    enabled: true,
    format: 'text',
    options: []
  },
  employeeName: {
    label: 'Employee Name',
    required: false,
    enabled: true,
    format: 'text'
  },
  employeeContact: {
    label: 'Employee Contact',
    required: false,
    enabled: true,
    format: 'phone'
  },
  expirationTime: {
    label: 'Expiration Time',
    required: false,
    enabled: true,
    format: 'datetime'
  },
  notes: {
    label: 'Notes',
    required: false,
    enabled: true,
    format: 'textarea',
    maxLength: 1000
  },
  equipment: {
    label: 'Equipment',
    required: false,
    enabled: false,
    format: 'text'
  },
  workDescription: {
    label: 'Work Description',
    required: false,
    enabled: false,
    format: 'textarea',
    maxLength: 500
  },
  speedRestriction: {
    label: 'Speed Restriction (MPH)',
    required: false,
    enabled: false,
    format: 'number',
    minValue: 0,
    maxValue: 150
  },
  liveLocationHud: {
    enabled: true,
    showSubdivision: true,
    showMilepost: true,
    showTrackNumber: true,
    showTrackType: true,
    showGpsAccuracy: true,
    milepostDecimals: 4,
    labelStyle: 'full',
    trackFormat: 'combined'
  },
  milepostInterpolation: {
    anchorSource: 'auto',
    refreshCadenceSeconds: 5,
    minMoveMeters: 25
  },
  proximityAlerts: {
    enabled: true,
    visibleRoles: ['Field_Worker', 'Supervisor', 'Administrator'],
    territoryMode: 'sameSubdivision'
  },
  overlapAlerts: {
    showEmployeeName: true,
    showEmployeePhone: true,
    highlightOverlapRange: true
  },
  notificationSettings: {
    enabled: true,
    pushEnabled: true,
    visualEnabled: true,
    vibrationEnabled: true,
    audioEnabled: true,
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '06:00',
      suppressLevels: ['informational', 'warning']
    },
    shiftRules: {
      enabled: false,
      start: '07:00',
      end: '19:00',
      suppressOutsideShiftLevels: ['informational']
    }
  },
  gpsAccuracyMonitoring: {
    enabled: true,
    degradedThresholdMeters: 25,
    criticalThresholdMeters: 50,
    minIntervalSeconds: 60
  },
  gpsSafetyAlerts: {
    enabled: true,
    accuracyThresholdMeters: 25,
    criticalAccuracyThresholdMeters: 50,
    staleAfterSeconds: 20,
    repeatFrequencySeconds: 30,
    pauseAuthorityAlertsOnLowAccuracy: true,
    alertTypes: {
      accuracy: true,
      satelliteLoss: true,
      staleSignal: true
    }
  }
};

const agencyFieldConfigStore = new Map();

const clone = (obj) => JSON.parse(JSON.stringify(obj));

const getDefaultFieldConfigurations = () => clone(DEFAULT_FIELD_CONFIGURATIONS);

const getFieldConfigurations = (agencyId) => {
  const parsedId = Number.parseInt(agencyId, 10);
  if (!Number.isFinite(parsedId)) return getDefaultFieldConfigurations();
  return clone(agencyFieldConfigStore.get(parsedId) || DEFAULT_FIELD_CONFIGURATIONS);
};

const setFieldConfigurations = (agencyId, fieldConfigurations) => {
  const parsedId = Number.parseInt(agencyId, 10);
  if (!Number.isFinite(parsedId)) return;
  agencyFieldConfigStore.set(parsedId, clone(fieldConfigurations));
};

const getMilepostDecimalPlaces = (agencyId) => {
  const fieldConfigurations = getFieldConfigurations(agencyId);
  const places = Number.parseInt(
    fieldConfigurations?.liveLocationHud?.milepostDecimals ??
      fieldConfigurations?.beginMP?.decimalPlaces ??
      fieldConfigurations?.endMP?.decimalPlaces ??
      4,
    10
  );
  if (Number.isNaN(places)) return 4;
  return Math.max(0, Math.min(6, places));
};

const getMilepostInterpolationConfig = (agencyId) => {
  const fieldConfigurations = getFieldConfigurations(agencyId);
  const interpolation = fieldConfigurations?.milepostInterpolation || {};
  const refreshCadenceSeconds = Math.max(
    1,
    Math.min(60, Number.parseInt(interpolation.refreshCadenceSeconds, 10) || 5)
  );
  const minMoveMeters = Math.max(
    0,
    Math.min(500, Number.parseInt(interpolation.minMoveMeters, 10) || 25)
  );

  const normalizedSource = String(interpolation.anchorSource || 'auto').toLowerCase();
  const anchorSource = ['auto', 'track_mileposts', 'milepost_geometry'].includes(normalizedSource)
    ? normalizedSource
    : 'auto';

  return {
    anchorSource,
    refreshCadenceSeconds,
    minMoveMeters,
  };
};

const getValidationRules = (agencyId) => {
  const fieldConfigurations = getFieldConfigurations(agencyId);
  const decimalPlaces = getMilepostDecimalPlaces(agencyId);

  return {
    beginMP: {
      type: 'number',
      min: fieldConfigurations?.beginMP?.minValue ?? 0,
      max: 9999.99,
      decimalPlaces,
      required: true
    },
    endMP: {
      type: 'number',
      min: fieldConfigurations?.endMP?.minValue ?? 0,
      max: 9999.99,
      decimalPlaces,
      required: true,
      validation: 'must be greater than Begin MP'
    },
    trackNumber: {
      type: 'string',
      maxLength: 10,
      pattern: '^[A-Za-z0-9-]+$',
      required: true
    },
    employeeContact: {
      type: 'string',
      pattern: '^[0-9]{3}-[0-9]{3}-[0-9]{4}$',
      format: 'phone',
      example: '555-123-4567'
    },
    speedRestriction: {
      type: 'number',
      min: 0,
      max: 150,
      unit: 'MPH'
    },
    expirationTime: {
      type: 'datetime',
      validation: 'must be in the future'
    }
  };
};

const getProximityAlertConfig = (agencyId) => {
  const fieldConfigurations = getFieldConfigurations(agencyId);
  const proximity = fieldConfigurations?.proximityAlerts || {};
  const visibleRoles = Array.isArray(proximity.visibleRoles)
    ? proximity.visibleRoles.map((role) => String(role).trim()).filter(Boolean)
    : ['Field_Worker', 'Supervisor', 'Administrator'];

  const territoryMode = ['sameSubdivision', 'sameTrack', 'agency']
    .includes(String(proximity.territoryMode || '').trim())
    ? String(proximity.territoryMode).trim()
    : 'sameSubdivision';

  return {
    enabled: proximity.enabled !== false,
    visibleRoles,
    territoryMode,
  };
};

const getOverlapAlertConfig = (agencyId) => {
  const fieldConfigurations = getFieldConfigurations(agencyId);
  const overlap = fieldConfigurations?.overlapAlerts || {};

  return {
    showEmployeeName: overlap.showEmployeeName !== false,
    showEmployeePhone: overlap.showEmployeePhone !== false,
    highlightOverlapRange: overlap.highlightOverlapRange !== false,
  };
};

const normalizeTime = (value, fallback) => {
  const raw = String(value || fallback || '').trim();
  if (!/^\d{2}:\d{2}$/.test(raw)) {
    return fallback;
  }
  const [h, m] = raw.split(':').map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return fallback;
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const normalizeLevels = (value, fallback) => {
  const base = Array.isArray(value) ? value : fallback;
  return [...new Set(base.map((level) => String(level).toLowerCase()).filter(Boolean))];
};

const getNotificationPolicyConfig = (agencyId) => {
  const fieldConfigurations = getFieldConfigurations(agencyId);
  const notificationSettings = fieldConfigurations?.notificationSettings || {};
  const quietHours = notificationSettings?.quietHours || {};
  const shiftRules = notificationSettings?.shiftRules || {};

  return {
    enabled: notificationSettings.enabled !== false,
    pushEnabled: notificationSettings.pushEnabled !== false,
    visualEnabled: notificationSettings.visualEnabled !== false,
    vibrationEnabled: notificationSettings.vibrationEnabled !== false,
    audioEnabled: notificationSettings.audioEnabled !== false,
    quietHours: {
      enabled: quietHours.enabled === true,
      start: normalizeTime(quietHours.start, '22:00'),
      end: normalizeTime(quietHours.end, '06:00'),
      suppressLevels: normalizeLevels(quietHours.suppressLevels, ['informational', 'warning']),
    },
    shiftRules: {
      enabled: shiftRules.enabled === true,
      start: normalizeTime(shiftRules.start, '07:00'),
      end: normalizeTime(shiftRules.end, '19:00'),
      suppressOutsideShiftLevels: normalizeLevels(shiftRules.suppressOutsideShiftLevels, ['informational']),
    },
  };
};

const getGpsAccuracyMonitoringConfig = (agencyId) => {
  const fieldConfigurations = getFieldConfigurations(agencyId);
  const gpsAccuracyMonitoring = fieldConfigurations?.gpsAccuracyMonitoring || {};

  const degradedThresholdMeters = Number.parseFloat(gpsAccuracyMonitoring.degradedThresholdMeters);
  const criticalThresholdMeters = Number.parseFloat(gpsAccuracyMonitoring.criticalThresholdMeters);
  const minIntervalSeconds = Number.parseInt(gpsAccuracyMonitoring.minIntervalSeconds, 10);

  return {
    enabled: gpsAccuracyMonitoring.enabled !== false,
    degradedThresholdMeters: Number.isFinite(degradedThresholdMeters) ? Math.max(5, degradedThresholdMeters) : 25,
    criticalThresholdMeters: Number.isFinite(criticalThresholdMeters)
      ? Math.max(
        Number.isFinite(degradedThresholdMeters) ? Math.max(5, degradedThresholdMeters) : 25,
        criticalThresholdMeters
      )
      : 50,
    minIntervalSeconds: Number.isFinite(minIntervalSeconds) ? Math.max(10, minIntervalSeconds) : 60,
  };
};

const getGpsSafetyAlertConfig = (agencyId) => {
  const fieldConfigurations = getFieldConfigurations(agencyId);
  const safety = fieldConfigurations?.gpsSafetyAlerts || {};
  const alertTypes = safety?.alertTypes || {};

  const accuracyThresholdMeters = Number.parseFloat(safety.accuracyThresholdMeters);
  const criticalAccuracyThresholdMeters = Number.parseFloat(safety.criticalAccuracyThresholdMeters);
  const staleAfterSeconds = Number.parseInt(safety.staleAfterSeconds, 10);
  const repeatFrequencySeconds = Number.parseInt(safety.repeatFrequencySeconds, 10);

  const normalizedAccuracyThreshold = Number.isFinite(accuracyThresholdMeters)
    ? Math.max(5, accuracyThresholdMeters)
    : 25;
  const normalizedCriticalThreshold = Number.isFinite(criticalAccuracyThresholdMeters)
    ? Math.max(normalizedAccuracyThreshold, criticalAccuracyThresholdMeters)
    : 50;

  return {
    enabled: safety.enabled !== false,
    accuracyThresholdMeters: normalizedAccuracyThreshold,
    criticalAccuracyThresholdMeters: normalizedCriticalThreshold,
    staleAfterSeconds: Number.isFinite(staleAfterSeconds) ? Math.max(5, staleAfterSeconds) : 20,
    repeatFrequencySeconds: Number.isFinite(repeatFrequencySeconds) ? Math.max(5, repeatFrequencySeconds) : 30,
    pauseAuthorityAlertsOnLowAccuracy: safety.pauseAuthorityAlertsOnLowAccuracy !== false,
    alertTypes: {
      accuracy: alertTypes.accuracy !== false,
      satelliteLoss: alertTypes.satelliteLoss !== false,
      staleSignal: alertTypes.staleSignal !== false,
    },
  };
};

module.exports = {
  getDefaultFieldConfigurations,
  getFieldConfigurations,
  setFieldConfigurations,
  getMilepostDecimalPlaces,
  getMilepostInterpolationConfig,
  getValidationRules,
  getProximityAlertConfig,
  getOverlapAlertConfig,
  getNotificationPolicyConfig,
  getGpsAccuracyMonitoringConfig,
  getGpsSafetyAlertConfig
};
