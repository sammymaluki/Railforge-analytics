import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import apiService from '../../services/api/ApiService';
import databaseService from '../../services/database/DatabaseService';

export const createAuthority = createAsyncThunk(
  'authority/create',
  async (authorityData, { rejectWithValue, getState }) => {
    try {
      const { auth } = getState();

      // Add user info if not provided
      const completeAuthorityData = {
        ...authorityData,
        userId: auth.user?.User_ID,
        employeeNameDisplay: authorityData.employeeNameDisplay || auth.user?.Employee_Name,
        employeeContactDisplay: authorityData.employeeContactDisplay || auth.user?.Employee_Contact,
      };

      const response = await apiService.createAuthority(completeAuthorityData);

      if (response.success) {
        // Save to local database
        const localId = await databaseService.saveAuthority({
          ...(response.data.authority || response.data),
          User_ID: auth.user?.User_ID,
        });

        return {
          ...response.data,
          localId,
          hasOverlap: response.data.hasOverlap || false,
          overlapDetails: response.data.overlapDetails || [],
        };
      }

      return rejectWithValue(response.error);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const endAuthority = createAsyncThunk(
  'authority/end',
  async ({ authorityId, confirmEndTracking = true }, { rejectWithValue }) => {
    try {
      console.log('Redux: Attempting to end authority', { authorityId, confirmEndTracking });
      const response = await apiService.endAuthority(authorityId, confirmEndTracking);
      console.log('Redux: End authority API response:', response);

      if (response.success) {
        // Update local cache
        await databaseService.endAuthority(authorityId, confirmEndTracking);
        return response.data;
      }

      return rejectWithValue(response.error);
    } catch (error) {
      console.error('Redux: Error in endAuthority:', error);

      const notFoundOnServer =
        Number(error?.status) === 404 ||
        String(error?.message || '').toLowerCase().includes('authority not found');

      if (notFoundOnServer) {
        // Server already has no such active authority; clear local state anyway.
        await databaseService.endAuthority(authorityId, confirmEndTracking);
        return { authorityId, endedLocally: true, notFoundOnServer: true };
      }

      // If offline, still update local database
      if (error.status === 0) {
        await databaseService.endAuthority(authorityId, confirmEndTracking);
        return { authorityId, endedLocally: true };
      }

      return rejectWithValue({
        message: error.message || 'Failed to clear authority',
      });
    }
  }
);

export const getActiveAuthority = createAsyncThunk(
  'authority/getActive',
  async (_, { rejectWithValue }) => {
    try {
      // Prefer server data first to avoid stale local authority IDs.
      const response = await apiService.getUserAuthorities(true);

      if (response.success && response.data.authorities.length > 0) {
        const activeAuthority = response.data.authorities[0];

        // Save to local database
        await databaseService.saveAuthority(activeAuthority);

        return activeAuthority;
      }

      // No active authority on server: clear local cache.
      await databaseService.endAuthority('stale-authority', true);
      return null;
    } catch (error) {
      // If offline, return local authority
      if (error.status === 0) {
        const localAuthority = await databaseService.getActiveAuthority();
        return localAuthority;
      }
      return rejectWithValue(error.message);
    }
  }
);

export const checkProximity = createAsyncThunk(
  'authority/checkProximity',
  async ({ authorityId, latitude, longitude, maxDistance = 1.0 }, { rejectWithValue }) => {
    try {
      const response = await apiService.checkProximity(
        authorityId,
        latitude,
        longitude,
        maxDistance
      );

      if (response.success) {
        return response.data;
      }

      return rejectWithValue(response.error);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const authoritySlice = createSlice({
  name: 'authority',
  initialState: {
    currentAuthority: null,
    activeAuthorities: [],
    userAuthorities: [],
    isLoading: false,
    isCreating: false,
    isEnding: false,
    error: null,
    overlapDetected: false,
    overlapDetails: [],
    proximityWorkers: [],
    lastProximityCheck: null,
  },
  reducers: {
    clearAuthorityError: (state) => {
      state.error = null;
    },
    setCurrentAuthority: (state, action) => {
      state.currentAuthority = action.payload;
    },
    clearCurrentAuthority: (state) => {
      state.currentAuthority = null;
    },
    updateAuthorityPosition: (state, action) => {
      if (state.currentAuthority) {
        state.currentAuthority.currentPosition = action.payload;
      }
    },
    setOverlapDetected: (state, action) => {
      state.overlapDetected = action.payload.detected;
      state.overlapDetails = action.payload.details || [];
    },
    clearProximityWorkers: (state) => {
      state.proximityWorkers = [];
    },
  },
  extraReducers: (builder) => {
    builder
      // Create authority
      .addCase(createAuthority.pending, (state) => {
        state.isCreating = true;
        state.error = null;
        state.overlapDetected = false;
        state.overlapDetails = [];
      })
      .addCase(createAuthority.fulfilled, (state, action) => {
        state.isCreating = false;
        state.currentAuthority = action.payload;
        state.overlapDetected = action.payload.hasOverlap || false;
        state.overlapDetails = action.payload.overlapDetails || [];
        state.error = null;
      })
      .addCase(createAuthority.rejected, (state, action) => {
        state.isCreating = false;
        state.error = action.payload;
      })

      // End authority
      .addCase(endAuthority.pending, (state) => {
        state.isEnding = true;
        state.error = null;
      })
      .addCase(endAuthority.fulfilled, (state) => {
        state.isEnding = false;
        state.currentAuthority = null;
        state.overlapDetected = false;
        state.overlapDetails = [];
        state.proximityWorkers = [];
        state.error = null;
      })
      .addCase(endAuthority.rejected, (state, action) => {
        state.isEnding = false;
        state.error = action.payload;
      })

      // Get active authority
      .addCase(getActiveAuthority.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(getActiveAuthority.fulfilled, (state, action) => {
        state.isLoading = false;
        state.currentAuthority = action.payload;
        state.error = null;
      })
      .addCase(getActiveAuthority.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })

      // Check proximity
      .addCase(checkProximity.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(checkProximity.fulfilled, (state, action) => {
        state.isLoading = false;
        state.proximityWorkers = action.payload.workersNearby || [];
        state.lastProximityCheck = new Date().toISOString();
        state.error = null;
      })
      .addCase(checkProximity.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      });
  },
});

export const {
  clearAuthorityError,
  setCurrentAuthority,
  clearCurrentAuthority,
  updateAuthorityPosition,
  setOverlapDetected,
  clearProximityWorkers,
} = authoritySlice.actions;

export default authoritySlice.reducer;
