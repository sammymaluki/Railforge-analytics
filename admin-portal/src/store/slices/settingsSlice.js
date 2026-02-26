import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';

// Async thunks
export const loadBranding = createAsyncThunk(
  'settings/loadBranding',
  async (agencyId, { rejectWithValue }) => {
    try {
      const response = await api.get(`/branding/agency/${agencyId}`);
      if (response.data.success) {
        return response.data.data;
      }
      return rejectWithValue('Failed to load branding');
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to load branding');
    }
  }
);

export const updateBranding = createAsyncThunk(
  'settings/updateBranding',
  async ({ agencyId, branding }, { rejectWithValue }) => {
    try {
      const response = await api.put(`/branding/agency/${agencyId}`, branding);
      if (response.data.success) {
        return response.data.data;
      }
      return rejectWithValue('Failed to update branding');
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update branding');
    }
  }
);

const settingsSlice = createSlice({
  name: 'settings',
  initialState: {
    branding: null,
    loading: false,
    error: null,
  },
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadBranding.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loadBranding.fulfilled, (state, action) => {
        state.loading = false;
        state.branding = action.payload;
      })
      .addCase(loadBranding.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(updateBranding.fulfilled, (state, action) => {
        state.branding = action.payload;
      });
  },
});

export const { clearError } = settingsSlice.actions;
export default settingsSlice.reducer;
