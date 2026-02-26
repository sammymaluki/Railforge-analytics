import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CONFIG } from '../../constants/config';
import databaseService from '../database/DatabaseService';

class ApiService {
  constructor() {
    console.log('🔧 ApiService initialized with BASE_URL:', CONFIG.API.BASE_URL);
    this.api = axios.create({
      baseURL: CONFIG.API.BASE_URL,
      timeout: CONFIG.API.TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    this.cachedUser = null;
    this.cacheTimestamp = null;
    this.CACHE_TTL = 5000; // Cache for 5 seconds

    // Request interceptor
    this.api.interceptors.request.use(
      async (config) => {
        // Skip token for auth endpoints and public endpoints
        const publicEndpoints = [
          '/auth/login', 
          '/auth/register', 
          '/auth/forgot-password',
          '/agencies/',  // Public agency data like subdivisions
        ];
        const isPublicEndpoint = publicEndpoints.some(endpoint => config.url?.includes(endpoint));
        
        if (isPublicEndpoint) {
          return config;
        }
        
        // Get token from AsyncStorage
        const now = Date.now();
        if (!this.cachedUser || !this.cacheTimestamp || (now - this.cacheTimestamp) > this.CACHE_TTL) {
          try {
            const userJson = await AsyncStorage.getItem('@HerzogDB:user');
            this.cachedUser = userJson ? JSON.parse(userJson) : null;
            this.cacheTimestamp = now;
          } catch (error) {
            console.error('Error getting user from AsyncStorage:', error);
            this.cachedUser = null;
          }
        }
        
        if (this.cachedUser && this.cachedUser.token) {
          config.headers.Authorization = `Bearer ${this.cachedUser.token}`;
        } else {
          console.warn('No token available for request to:', config.url);
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        
        // Don't retry refresh-token endpoint to prevent infinite loops
        if (originalRequest.url?.includes('/auth/refresh-token')) {
          // Refresh token failed, log user out
          await this.handleLogout();
          return Promise.reject(error);
        }
        
        // Handle token refresh for other endpoints
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          
          // Check if we have a user before attempting refresh
          try {
            const userJson = await AsyncStorage.getItem('@HerzogDB:user');
            const user = userJson ? JSON.parse(userJson) : null;
            
            if (!user || !user.token) {
              // No user logged in, don't try to refresh
              return Promise.reject(error);
            }
          } catch (err) {
            return Promise.reject(error);
          }
          
          try {
            const newToken = await this.refreshToken();
            if (newToken) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              return this.api(originalRequest);
            } else {
              // Refresh failed, log user out
              await this.handleLogout();
              return Promise.reject(error);
            }
          } catch (refreshError) {
            // Refresh failed, log user out
            await this.handleLogout();
            return Promise.reject(refreshError);
          }
        }
        
        return Promise.reject(error);
      }
    );
  }

  // Helper: delay for backoff
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Generic retry wrapper for transient network errors and 5xx responses
  async requestWithRetry(fn, attempts = 3, baseDelay = 1000) {
    let lastError;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        const shouldRetry =
          err.code === 'ECONNABORTED' ||
          err.code === 'ECONNRESET' ||
          err.code === 'ERR_NETWORK' ||
          err.message?.includes('Network Error') ||
          err.message?.includes('ECONNRESET') ||
          (err.response && err.response.status >= 500);
        if (!shouldRetry) throw err;
        const delayMs = baseDelay * Math.pow(2, i);
        console.warn(`Request attempt ${i + 1} failed, retrying in ${delayMs}ms`);
        await this.delay(delayMs);
      }
    }
    throw lastError;
  }

  async refreshToken() {
    try {
      const response = await this.api.post('/auth/refresh-token');
      if (response.data.success && response.data.data.token) {
        const user = await databaseService.getUser();
        if (user) {
          await databaseService.updateUserToken(user.user_id, response.data.data.token);
          // Clear cache when token is updated
          this.cachedUser = null;
          this.cacheTimestamp = 0;
        }
        return response.data.data.token;
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
      return null;
    }
  }

  async handleLogout() {
    // Clear cache on logout
    this.cachedUser = null;
    this.cacheTimestamp = 0;
    
    // Clear local storage
    await AsyncStorage.clear();
    await databaseService.clearDatabase();
    
    // Navigate to login (handled by auth service)
    return true;
  }

  // Auth endpoints
  async get(url, config = {}) {
    return this.api.get(url, config);
  }

  async post(url, data = {}, config = {}) {
    return this.api.post(url, data, config);
  }

  async put(url, data = {}, config = {}) {
    return this.api.put(url, data, config);
  }

  async delete(url, config = {}) {
    return this.api.delete(url, config);
  }

  async login(username, password) {
    try {
      console.log('🔐 Attempting login to:', this.api.defaults.baseURL + '/auth/login');
      console.log('🌐 Full URL:', `${this.api.defaults.baseURL}/auth/login`);
      const result = await this.requestWithRetry(() => this.api.post('/auth/login', { username, password }), 3, 1000);
      console.log('✅ Login successful');
      return result.data;
    } catch (error) {
      console.log('❌ Login failed:', error.message);
      if (error.code === 'ECONNABORTED') {
        console.log('⏱️ Request timeout - backend might be unreachable');
      }
      if (error.code === 'ERR_NETWORK' || error.message.includes('Network Error')) {
        console.log('🔌 Network error - check WiFi connection and backend status');
      }
      throw this.handleError(error);
    }
  }

  async register(userData) {
    try {
      const response = await this.api.post('/auth/register', userData);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getProfile() {
    try {
      const response = await this.api.get('/auth/profile');
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async updateProfile(profileData) {
    try {
      const response = await this.api.put('/auth/profile', profileData);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async changePassword(currentPassword, newPassword) {
    try {
      const response = await this.api.post('/auth/change-password', {
        currentPassword,
        newPassword
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Agency endpoints
  async getAgencies(page = 1, limit = 20, search = '') {
    try {
      const response = await this.api.get('/agencies', {
        params: { page, limit, search }
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getAgencyStats(agencyId) {
    try {
      const response = await this.api.get(`/agencies/${agencyId}/stats`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getAgencySubdivisions(agencyId) {
    try {
      const response = await this.api.get(`/agencies/${agencyId}/subdivisions`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getSubdivisionTracks(agencyId, subdivisionId) {
    try {
      const response = await this.api.get(`/agencies/${agencyId}/subdivisions/${subdivisionId}/tracks`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getAuthorityFieldConfigurations(agencyId) {
    try {
      const response = await this.api.get(`/config/agencies/${agencyId}/authority-config/fields`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getAuthorityValidationRules(agencyId) {
    try {
      const response = await this.api.get(`/config/agencies/${agencyId}/authority-config/validation`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getTrackSearchOptions(subdivisionId = null) {
    try {
      const response = await this.api.get('/tracks/search-options', {
        params: {
          subdivisionId: subdivisionId || undefined,
        },
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Authority endpoints
  async createAuthority(authorityData) {
    try {
      const response = await this.api.post('/authorities', authorityData);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getActiveAuthorities(subdivisionId = null, trackType = null, trackNumber = null) {
    try {
      const response = await this.api.get('/authorities/active', {
        params: { subdivisionId, trackType, trackNumber }
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getUserAuthorities(activeOnly = true) {
    try {
      const response = await this.api.get('/authorities/my', {
        params: { activeOnly }
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async endAuthority(authorityId, confirmEndTracking = true) {
    try {
      const response = await this.api.post(`/authorities/${authorityId}/end`, {
        confirmEndTracking
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async checkProximity(authorityId, latitude, longitude, maxDistance = 1.0) {
    try {
      const response = await this.api.post(`/authorities/${authorityId}/check-proximity`, {
        latitude,
        longitude,
        maxDistance
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Alert endpoints
  async getAlertConfigurations(agencyId) {
    try {
      const response = await this.api.get(`/alerts/config/${agencyId}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getUserAlerts(limit = 50, unreadOnly = false) {
    try {
      const response = await this.api.get('/alerts/user', {
        params: { limit, unreadOnly }
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async markAlertAsRead(alertId) {
    try {
      const response = await this.api.post(`/alerts/${alertId}/read`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // GPS endpoints
  async updateGPSPosition(gpsData) {
    try {
      const response = await this.requestWithRetry(
        () => this.api.post('/gps/update', gpsData),
        3,
        600
      );
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getActivePositions() {
    try {
      const response = await this.api.get('/gps/active-positions');
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Data download endpoints
  async downloadAgencyData(agencyId) {
    try {
      const response = await this.api.get(`/agencies/${agencyId}/data`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async downloadSubdivisionData(agencyId, subdivisionId) {
    try {
      // Backend exposes subdivision downloads under /offline/agency/:agencyId/subdivision/:subdivisionId
      const response = await this.api.get(`/offline/agency/${agencyId}/subdivision/${subdivisionId}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Upload endpoints
  async uploadPinPhoto(formData) {
    try {
      const response = await this.api.post('/upload/pin-photo', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async createPin(pinData) {
    try {
      const response = await this.api.post('/pins', pinData);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async syncData(syncItems) {
    try {
      const response = await this.api.post('/sync', { items: syncItems });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Map layers
  async getMapLayers(params = {}) {
    try {
      const response = await this.requestWithRetry(
        () => this.api.get('/map/layers', { params }),
        4,
        800
      );
      return response.data?.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async updatePin(pinId, pinData) {
    try {
      const response = await this.api.put(`/pins/${pinId}`, pinData);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getMapLayerData(layerId, params = {}) {
    try {
      const response = await this.requestWithRetry(
        () => this.api.get(`/map/layers/${encodeURI(layerId)}`, { params }),
        4,
        800
      );
      return response.data?.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async searchMapLayers(params = {}) {
    try {
      const response = await this.requestWithRetry(
        () => this.api.get('/map/search', { params }),
        4,
        800
      );
      return response.data?.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getAuthorityBoundary(authorityId) {
    try {
      const response = await this.requestWithRetry(
        () => this.api.get(`/map/authority/${authorityId}/boundary`),
        3,
        600
      );
      return response.data?.data;
    } catch (error) {
      console.warn('Failed to load authority boundary:', error);
      return null; // Return null if boundary not available
    }
  }

  // Error handling
  handleError(error) {
    if (error.response) {
      // Server responded with error
      const { data, status } = error.response;
      
      if (data && data.error) {
        return {
          message: data.error,
          status,
          details: data.details
        };
      }
      
      return {
        message: `Server error: ${status}`,
        status
      };
    } else if (error.request) {
      // Request made but no response
      return {
        message: 'Network error. Please check your connection.',
        status: 0
      };
    } else {
      // Something else happened
      return {
        message: error.message || 'An unknown error occurred',
        status: -1
      };
    }
  }

  // Network status
  isNetworkError(error) {
    return error.status === 0;
  }
}

// Export singleton instance
const apiService = new ApiService();
export default apiService;
