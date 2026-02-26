import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  // Current location
  currentPosition: null,
  previousPosition: null,
  
  // Tracking info
  currentMilepost: null,
  currentTrack: null,
  heading: 0,
  speed: 0,
  accuracy: null,
  
  // Permissions
  locationPermission: null, // 'granted', 'denied', 'undetermined'
  backgroundLocationPermission: null,
  
  // Tracking state
  isTracking: false,
  trackingStartTime: null,
  totalDistance: 0,
  
  // GPS quality
  signalStrength: 'unknown', // 'excellent', 'good', 'fair', 'poor', 'unknown'
  satelliteCount: 0,
  locationReliability: {
    mode: 'RELIABLE', // RELIABLE | UNRELIABLE
    reasons: [],
    pauseAuthorityAlerts: false,
    message: null,
    timestamp: null,
  },
  
  // Error handling
  error: null,
  lastUpdate: null,
};

const gpsSlice = createSlice({
  name: 'gps',
  initialState,
  reducers: {
    updatePosition: (state, action) => {
      state.previousPosition = state.currentPosition;
      state.currentPosition = action.payload;
      state.lastUpdate = new Date().toISOString();
      
      // Update GPS quality
      if (action.payload.accuracy) {
        state.accuracy = action.payload.accuracy;
        if (action.payload.accuracy < 5) {
          state.signalStrength = 'excellent';
        } else if (action.payload.accuracy < 10) {
          state.signalStrength = 'good';
        } else if (action.payload.accuracy < 20) {
          state.signalStrength = 'fair';
        } else {
          state.signalStrength = 'poor';
        }
      }
    },
    updateTrackingInfo: (state, action) => {
      const { milepost, track, heading, speed } = action.payload;
      if (milepost !== undefined) state.currentMilepost = milepost;
      if (track !== undefined) state.currentTrack = track;
      if (heading !== undefined) state.heading = heading;
      if (speed !== undefined) state.speed = speed;
    },
    setLocationPermission: (state, action) => {
      state.locationPermission = action.payload;
    },
    setBackgroundLocationPermission: (state, action) => {
      state.backgroundLocationPermission = action.payload;
    },
    startTracking: (state) => {
      state.isTracking = true;
      state.trackingStartTime = new Date().toISOString();
      state.totalDistance = 0;
    },
    stopTracking: (state) => {
      state.isTracking = false;
      state.trackingStartTime = null;
    },
    updateTotalDistance: (state, action) => {
      state.totalDistance += action.payload;
    },
    setSatelliteCount: (state, action) => {
      state.satelliteCount = action.payload;
    },
    setLocationReliability: (state, action) => {
      const payload = action.payload || {};
      state.locationReliability = {
        mode: payload.mode === 'UNRELIABLE' ? 'UNRELIABLE' : 'RELIABLE',
        reasons: Array.isArray(payload.reasons) ? payload.reasons : [],
        pauseAuthorityAlerts: Boolean(payload.pauseAuthorityAlerts),
        message: payload.message || null,
        timestamp: payload.timestamp || new Date().toISOString(),
      };
    },
    setGpsError: (state, action) => {
      state.error = action.payload;
    },
    clearGpsError: (state) => {
      state.error = null;
    },
    resetGpsState: (state) => {
      return {
        ...initialState,
        locationPermission: state.locationPermission,
        backgroundLocationPermission: state.backgroundLocationPermission,
      };
    },
  },
});

export const {
  updatePosition,
  updateTrackingInfo,
  setLocationPermission,
  setBackgroundLocationPermission,
  startTracking,
  stopTracking,
  updateTotalDistance,
  setSatelliteCount,
  setLocationReliability,
  setGpsError,
  clearGpsError,
  resetGpsState,
} = gpsSlice.actions;

export default gpsSlice.reducer;
