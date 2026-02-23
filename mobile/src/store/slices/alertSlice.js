import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import apiService from '../../services/api/ApiService';

// Async thunks
export const fetchAlerts = createAsyncThunk(
  'alerts/fetchAlerts',
  async (_, { rejectWithValue }) => {
    try {
      console.log('Fetching alerts using getUserAlerts');
      const response = await apiService.getUserAlerts();
      console.log('Alerts response:', response);
      return response;
    } catch (error) {
      console.error('Fetch alerts error:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      return rejectWithValue(error.message || 'Failed to fetch alerts');
    }
  }
);

export const fetchAlertById = createAsyncThunk(
  'alerts/fetchAlertById',
  async (alertId, { rejectWithValue }) => {
    try {
      const response = await apiService.get(`/alerts/${alertId}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch alert');
    }
  }
);

export const markAlertAsRead = createAsyncThunk(
  'alerts/markAsRead',
  async (alertId, { rejectWithValue }) => {
    try {
      const response = await apiService.markAlertAsRead(alertId);
      return response;
    } catch (error) {
      return rejectWithValue(error.message || 'Failed to mark alert as read');
    }
  }
);

export const deleteAlert = createAsyncThunk(
  'alerts/deleteAlert',
  async (alertId, { rejectWithValue }) => {
    try {
      await apiService.delete(`/alerts/${alertId}`);
      return alertId;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to delete alert');
    }
  }
);

export const createProximityAlert = createAsyncThunk(
  'alerts/createProximityAlert',
  async (alertData, { rejectWithValue }) => {
    try {
      const response = await apiService.post('/alerts/proximity', alertData);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create proximity alert');
    }
  }
);

const initialState = {
  alerts: [],
  selectedAlert: null,
  unreadAlertsCount: 0,
  proximityAlerts: [],
  loading: false,
  error: null,
};

const alertSlice = createSlice({
  name: 'alerts',
  initialState,
  reducers: {
    addLocalAlert: (state, action) => {
      state.alerts.unshift(action.payload);
      if (!action.payload.isRead) {
        state.unreadAlertsCount += 1;
      }
    },
    markLocalAlertAsRead: (state, action) => {
      const alert = state.alerts.find(a => a.id === action.payload);
      if (alert && !alert.isRead) {
        alert.isRead = true;
        state.unreadAlertsCount = Math.max(0, state.unreadAlertsCount - 1);
      }
    },
    clearAlerts: (state) => {
      state.alerts = [];
      state.unreadAlertsCount = 0;
      state.selectedAlert = null;
      state.proximityAlerts = [];
    },
    setSelectedAlert: (state, action) => {
      state.selectedAlert = action.payload;
    },
    updateUnreadCount: (state) => {
      state.unreadAlertsCount = state.alerts.filter(a => !a.isRead).length;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch alerts
      .addCase(fetchAlerts.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAlerts.fulfilled, (state, action) => {
        state.loading = false;
        console.log('fetchAlerts.fulfilled - payload:', action.payload);
        // API returns { success: true, data: { alerts: [...], count: X, unreadCount: Y } }
        const responseData = action.payload.data || action.payload;
        const alertsArray = responseData.alerts || [];
        
        // Map backend fields to frontend format
        state.alerts = alertsArray.map(alert => ({
          id: alert.Alert_Log_ID,
          type: alert.Alert_Type,
          level: alert.Alert_Level,
          message: alert.Message,
          authorityId: alert.Authority_ID,
          triggeredDistance: alert.Triggered_Distance,
          isRead: alert.Is_Read,
          isDelivered: alert.Is_Delivered,
          deliveredTime: alert.Delivered_Time,
          readTime: alert.Read_Time,
          createdDate: alert.Created_Date
        }));
        
        state.unreadAlertsCount = responseData.unreadCount || alertsArray.filter(a => !a.Is_Read).length;
      })
      .addCase(fetchAlerts.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Fetch alert by ID
      .addCase(fetchAlertById.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAlertById.fulfilled, (state, action) => {
        state.loading = false;
        state.selectedAlert = action.payload;
      })
      .addCase(fetchAlertById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Mark alert as read
      .addCase(markAlertAsRead.fulfilled, (state, action) => {
        const alert = state.alerts.find(a => a.id === action.payload.id);
        if (alert && !alert.isRead) {
          alert.isRead = true;
          state.unreadAlertsCount = Math.max(0, state.unreadAlertsCount - 1);
        }
      })
      // Delete alert
      .addCase(deleteAlert.fulfilled, (state, action) => {
        const alertIndex = state.alerts.findIndex(a => a.id === action.payload);
        if (alertIndex !== -1) {
          const alert = state.alerts[alertIndex];
          if (!alert.isRead) {
            state.unreadAlertsCount = Math.max(0, state.unreadAlertsCount - 1);
          }
          state.alerts.splice(alertIndex, 1);
        }
      })
      // Create proximity alert
      .addCase(createProximityAlert.fulfilled, (state, action) => {
        state.proximityAlerts.push(action.payload);
        state.alerts.unshift(action.payload);
        if (!action.payload.isRead) {
          state.unreadAlertsCount += 1;
        }
      });
  },
});

export const {
  addLocalAlert,
  markLocalAlertAsRead,
  clearAlerts,
  setSelectedAlert,
  updateUnreadCount,
} = alertSlice.actions;

export default alertSlice.reducer;
