import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';
import { hasAdminPortalAccess } from '../../utils/rbac';

// Async thunks
export const login = createAsyncThunk(
  'auth/login',
  async (credentials, { rejectWithValue }) => {
    try {
      const response = await api.post('/auth/login', { ...credentials, clientType: 'admin_portal' });
      if (response.data.success) {
        if (!hasAdminPortalAccess(response.data.data.user)) {
          localStorage.removeItem('admin_token');
          delete api.defaults.headers.common['Authorization'];
          return rejectWithValue('Access denied. This account cannot access the admin portal.');
        }

        localStorage.setItem('admin_token', response.data.data.token);
        api.defaults.headers.common['Authorization'] = `Bearer ${response.data.data.token}`;
        return response.data.data;
      }
      return rejectWithValue(response.data.error || response.data.message || 'Login failed');
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || error.response?.data?.message || 'Login failed');
    }
  }
);

export const register = createAsyncThunk(
  'auth/register',
  async (payload, { rejectWithValue }) => {
    try {
      const response = await api.post('/auth/register', payload);
      if (response.data.success) {
        if (!hasAdminPortalAccess(response.data.data.user)) {
          localStorage.removeItem('admin_token');
          delete api.defaults.headers.common['Authorization'];
          return rejectWithValue('Access denied. This account cannot access the admin portal.');
        }

        localStorage.setItem('admin_token', response.data.data.token);
        api.defaults.headers.common['Authorization'] = `Bearer ${response.data.data.token}`;
        return response.data.data;
      }
      return rejectWithValue(response.data.error || response.data.message || 'Registration failed');
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || error.response?.data?.message || 'Registration failed');
    }
  }
);

export const verifyToken = createAsyncThunk(
  'auth/verifyToken',
  async (token, { rejectWithValue }) => {
    try {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      const response = await api.get('/auth/verify');
      if (response.data.success) {
        if (!hasAdminPortalAccess(response.data.data.user)) {
          localStorage.removeItem('admin_token');
          delete api.defaults.headers.common['Authorization'];
          return rejectWithValue('Access denied. This account cannot access the admin portal.');
        }

        return response.data.data;
      }
      return rejectWithValue('Token verification failed');
    } catch (error) {
      localStorage.removeItem('admin_token');
      delete api.defaults.headers.common['Authorization'];
      return rejectWithValue('Invalid token');
    }
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    token: null,
    isAuthenticated: false,
    loading: false,
    error: null,
  },
  reducers: {
    logout: (state) => {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
      localStorage.removeItem('admin_token');
      delete api.defaults.headers.common['Authorization'];
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false;
        state.isAuthenticated = true;
        state.user = action.payload.user;
        state.token = action.payload.token;
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.isAuthenticated = false;
        state.user = null;
        state.token = null;
        state.error = action.payload;
      })
      .addCase(register.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(register.fulfilled, (state, action) => {
        state.loading = false;
        state.isAuthenticated = true;
        state.user = action.payload.user;
        state.token = action.payload.token;
      })
      .addCase(register.rejected, (state, action) => {
        state.loading = false;
        state.isAuthenticated = false;
        state.user = null;
        state.token = null;
        state.error = action.payload;
      })
      .addCase(verifyToken.fulfilled, (state, action) => {
        state.isAuthenticated = true;
        state.user = action.payload.user;
      })
      .addCase(verifyToken.rejected, (state) => {
        state.isAuthenticated = false;
        state.user = null;
        state.token = null;
      });
  },
});

export const { logout, clearError } = authSlice.actions;
export default authSlice.reducer;
