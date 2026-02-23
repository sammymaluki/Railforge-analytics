import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import apiService from '../../services/api/ApiService';

// Async thunks
export const fetchSubdivisions = createAsyncThunk(
  'map/fetchSubdivisions',
  async (agencyId, { rejectWithValue }) => {
    try {
      const response = await apiService.get(`/subdivisions/agency/${agencyId}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch subdivisions');
    }
  }
);

export const fetchMileposts = createAsyncThunk(
  'map/fetchMileposts',
  async (subdivisionId, { rejectWithValue }) => {
    try {
      const response = await apiService.get(`/tracks/mileposts/${subdivisionId}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch mileposts');
    }
  }
);

export const fetchTrackGeometry = createAsyncThunk(
  'map/fetchTrackGeometry',
  async (subdivisionId, { rejectWithValue }) => {
    try {
      const response = await apiService.get(`/tracks/geometry/${subdivisionId}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch track geometry');
    }
  }
);

const initialState = {
  // Map view settings
  region: {
    latitude: 34.0522,
    longitude: -118.2437,
    latitudeDelta: 0.1,
    longitudeDelta: 0.1,
  },
  mapType: 'standard', // 'standard', 'satellite', 'hybrid'
  mapStyleId: 'imagery_labels',
  followMeEnabled: false,
  
  // Track data
  subdivisions: [],
  mileposts: [],
  trackGeometry: [],
  selectedSubdivision: null,
  
  // Map layers
  showAuthorities: true,
  showPins: true,
  showMileposts: false,
  showTrackNumbers: true,
  layerVisibility: {},
  
  // Loading states
  loading: false,
  error: null,
};

const mapSlice = createSlice({
  name: 'map',
  initialState,
  reducers: {
    setMapRegion: (state, action) => {
      state.region = action.payload;
    },
    setMapType: (state, action) => {
      state.mapType = action.payload;
    },
    setMapStyleId: (state, action) => {
      state.mapStyleId = action.payload;
    },
    setFollowMeEnabled: (state, action) => {
      console.log('🔍 setFollowMeEnabled called with:', {
        value: action.payload,
        type: typeof action.payload,
        converted: Boolean(action.payload)
      });
      state.followMeEnabled = Boolean(action.payload);
    },
    setSelectedSubdivision: (state, action) => {
      state.selectedSubdivision = action.payload;
    },
    toggleLayer: (state, action) => {
      const { layer, value } = action.payload;
      state[layer] = value !== undefined ? value : !state[layer];
    },
    setLayerVisibility: (state, action) => {
      const { layerId, value } = action.payload;
      state.layerVisibility[layerId] = Boolean(value);
    },
    centerOnLocation: (state, action) => {
      const { latitude, longitude } = action.payload;
      state.region = {
        latitude,
        longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
    },
    centerOnAuthority: (state, action) => {
      const { beginMilepost, endMilepost, latitude, longitude } = action.payload;
      if (latitude && longitude) {
        state.region = {
          latitude,
          longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        };
      }
    },
    clearMapData: (state) => {
      state.subdivisions = [];
      state.mileposts = [];
      state.trackGeometry = [];
      state.selectedSubdivision = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch subdivisions
      .addCase(fetchSubdivisions.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSubdivisions.fulfilled, (state, action) => {
        state.loading = false;
        state.subdivisions = action.payload;
      })
      .addCase(fetchSubdivisions.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Fetch mileposts
      .addCase(fetchMileposts.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMileposts.fulfilled, (state, action) => {
        state.loading = false;
        state.mileposts = action.payload;
      })
      .addCase(fetchMileposts.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Fetch track geometry
      .addCase(fetchTrackGeometry.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTrackGeometry.fulfilled, (state, action) => {
        state.loading = false;
        state.trackGeometry = action.payload;
      })
      .addCase(fetchTrackGeometry.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const {
  setMapRegion,
  setMapType,
  setMapStyleId,
  setFollowMeEnabled,
  setSelectedSubdivision,
  toggleLayer,
  setLayerVisibility,
  centerOnLocation,
  centerOnAuthority,
  clearMapData,
} = mapSlice.actions;

export default mapSlice.reducer;
