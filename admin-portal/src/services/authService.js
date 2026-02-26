import api from './api';

export const authService = {
  login: async (credentials) => {
    const response = await api.post('/auth/login', { ...credentials, clientType: 'admin_portal' });
    return response.data;
  },

  register: async (payload) => {
    const response = await api.post('/auth/register', payload);
    return response.data;
  },

  verifyToken: async (token) => {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    const response = await api.get('/auth/verify');
    return response.data;
  },

  logout: () => {
    localStorage.removeItem('admin_token');
    delete api.defaults.headers.common['Authorization'];
  },
};

export default authService;
