import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import apiService from '../../services/api/ApiService';
import { resolveMediaUri } from '../../utils/media';

const parsePhotoUrls = (pin) => {
  const source = pin.Photo_URLs || pin.photoUrls;
  if (!source) {
    const fallback = resolveMediaUri(pin.Photo_URL || pin.photo_url || pin.photoUrl);
    return fallback ? [fallback] : [];
  }
  if (Array.isArray(source)) {
    return source.map((url) => resolveMediaUri(url)).filter(Boolean);
  }
  try {
    const parsed = JSON.parse(source);
    if (Array.isArray(parsed)) {
      return parsed.map((url) => resolveMediaUri(url)).filter(Boolean);
    }
  } catch (error) {
    // Ignore invalid payloads and fallback to Photo_URL.
  }
  const fallback = resolveMediaUri(pin.Photo_URL || pin.photo_url || pin.photoUrl);
  return fallback ? [fallback] : [];
};

// Async thunks
export const fetchPins = createAsyncThunk(
  'pins/fetchPins',
  async (authorityId, { rejectWithValue }) => {
    try {
      const response = await apiService.get(`/pins/authority/${authorityId}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch pins');
    }
  }
);

export const createPin = createAsyncThunk(
  'pins/createPin',
  async (pinData, { rejectWithValue }) => {
    try {
      const response = await apiService.post('/pins', pinData);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create pin');
    }
  }
);

export const uploadPinPhoto = createAsyncThunk(
  'pins/uploadPhoto',
  async ({ pinId, photoUri }, { rejectWithValue }) => {
    try {
      const formData = new FormData();
      formData.append('photo', {
        uri: photoUri,
        type: 'image/jpeg',
        name: `pin_${pinId}_${Date.now()}.jpg`,
      });
      
      const response = await apiService.post(`/pins/${pinId}/photo`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to upload photo');
    }
  }
);

export const syncPins = createAsyncThunk(
  'pins/syncPins',
  async (_, { getState, rejectWithValue }) => {
    try {
      const { pins } = getState().pins;
      const unsyncedPins = pins.filter(p => p.syncPending);
      
      const syncPromises = unsyncedPins.map(pin =>
        apiService.post('/pins', pin)
      );
      
      const results = await Promise.all(syncPromises);
      return results.map(r => r.data);
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to sync pins');
    }
  }
);

const initialState = {
  pins: [],
  selectedPin: null,
  loading: false,
  error: null,
  syncStatus: 'idle', // 'idle', 'syncing', 'success', 'error'
};

const pinSlice = createSlice({
  name: 'pins',
  initialState,
  reducers: {
    addPin: (state, action) => {
      state.pins.push({
        ...action.payload,
        id: action.payload.id || `temp_${Date.now()}`,
        syncPending: action.payload.syncPending ?? true,
        createdAt: action.payload.createdAt || new Date().toISOString(),
      });
    },
    updatePin: (state, action) => {
      const index = state.pins.findIndex(p => p.id === action.payload.id);
      if (index !== -1) {
        state.pins[index] = { ...state.pins[index], ...action.payload };
      }
    },
    deletePin: (state, action) => {
      state.pins = state.pins.filter(p => p.id !== action.payload);
    },
    setSelectedPin: (state, action) => {
      state.selectedPin = action.payload;
    },
    markPinAsSynced: (state, action) => {
      const pin = state.pins.find(p => p.id === action.payload);
      if (pin) {
        pin.syncPending = false;
      }
    },
    clearPins: (state) => {
      state.pins = [];
      state.selectedPin = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch pins
      .addCase(fetchPins.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPins.fulfilled, (state, action) => {
        state.loading = false;
        // API returns { success: true, data: [...] }
        const pinsData = action.payload.data || action.payload;
        console.log('Fetched pins in reducer:', pinsData);
        state.pins = Array.isArray(pinsData) ? pinsData.map(pin => {
          const photoUrls = parsePhotoUrls(pin);
          return {
            id: pin.Pin_ID,
            pinTypeId: pin.Pin_Type_ID,
            category: pin.Pin_Category || pin.Type_Name || 'Unknown',
            latitude: pin.Latitude,
            longitude: pin.Longitude,
            trackType: pin.Track_Type,
            trackNumber: pin.Track_Number,
            milepost: pin.MP,
            notes: pin.Notes,
            photos: photoUrls.map((uri) => ({ uri })),
            photoUri: photoUrls[0] || null,
            timestamp: pin.Created_Date,
            syncPending: false
          };
        }) : [];
      })
      .addCase(fetchPins.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Create pin
      .addCase(createPin.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createPin.fulfilled, (state, action) => {
        state.loading = false;
        const tempIndex = state.pins.findIndex(p => p.syncPending && p.tempId === action.meta.arg.tempId);
        if (tempIndex !== -1) {
          state.pins[tempIndex] = { ...action.payload, syncPending: false };
        } else {
          state.pins.push({ ...action.payload, syncPending: false });
        }
      })
      .addCase(createPin.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Upload photo
      .addCase(uploadPinPhoto.fulfilled, (state, action) => {
        const pin = state.pins.find(p => p.id === action.meta.arg.pinId);
        if (pin) {
          pin.photoUri = action.payload.photoUri;
        }
      })
      // Sync pins
      .addCase(syncPins.pending, (state) => {
        state.syncStatus = 'syncing';
      })
      .addCase(syncPins.fulfilled, (state, action) => {
        state.syncStatus = 'success';
        action.payload.forEach(syncedPin => {
          const index = state.pins.findIndex(p => p.tempId === syncedPin.tempId);
          if (index !== -1) {
            state.pins[index] = { ...syncedPin, syncPending: false };
          }
        });
      })
      .addCase(syncPins.rejected, (state, action) => {
        state.syncStatus = 'error';
        state.error = action.payload;
      });
  },
});

export const {
  addPin,
  updatePin,
  deletePin,
  setSelectedPin,
  markPinAsSynced,
  clearPins,
} = pinSlice.actions;

export default pinSlice.reducer;
