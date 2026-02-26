import api from './api';

/**
 * Audit Log Service
 * Handles all audit log-related API calls
 */

export const auditLogService = {
  /**
   * Get audit logs with filtering and pagination
   */
  getAuditLogs: async (agencyId, params = {}) => {
    const queryParams = new URLSearchParams();
    
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);
    if (params.actionType && params.actionType !== 'all') queryParams.append('actionType', params.actionType);
    if (params.tableName && params.tableName !== 'all') queryParams.append('tableName', params.tableName);
    if (params.userId) queryParams.append('userId', params.userId);
    if (params.page) queryParams.append('page', params.page);
    if (params.limit) queryParams.append('limit', params.limit);
    if (params.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params.sortOrder) queryParams.append('sortOrder', params.sortOrder);

    const response = await api.get(`/audit/${agencyId}/logs?${queryParams.toString()}`);
    return response.data;
  },

  /**
   * Get audit log statistics
   */
  getAuditLogStats: async (agencyId, params = {}) => {
    const queryParams = new URLSearchParams();
    
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);

    const response = await api.get(`/audit/${agencyId}/stats?${queryParams.toString()}`);
    return response.data;
  },

  /**
   * Get available action types
   */
  getActionTypes: async (agencyId) => {
    const response = await api.get(`/audit/${agencyId}/action-types`);
    return response.data;
  },

  /**
   * Get affected tables
   */
  getAffectedTables: async (agencyId) => {
    const response = await api.get(`/audit/${agencyId}/affected-tables`);
    return response.data;
  },

  /**
   * Get retention policy
   */
  getRetentionPolicy: async (agencyId) => {
    const response = await api.get(`/audit/${agencyId}/retention-policy`);
    return response.data;
  },

  /**
   * Update retention policy
   */
  updateRetentionPolicy: async (agencyId, payload) => {
    const response = await api.put(`/audit/${agencyId}/retention-policy`, payload);
    return response.data;
  },

  /**
   * Run retention cleanup now
   */
  runRetentionCleanup: async (agencyId) => {
    const response = await api.post(`/audit/${agencyId}/retention-run`);
    return response.data;
  },

  /**
   * Export audit logs to Excel
   */
  exportAuditLogs: async (agencyId, params = {}) => {
    const queryParams = new URLSearchParams();
    
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);
    if (params.actionType && params.actionType !== 'all') queryParams.append('actionType', params.actionType);
    if (params.tableName && params.tableName !== 'all') queryParams.append('tableName', params.tableName);
    if (params.userId) queryParams.append('userId', params.userId);

    const response = await api.get(`/audit/${agencyId}/export?${queryParams.toString()}`, {
      responseType: 'blob'
    });

    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `audit_logs_${new Date().toISOString().split('T')[0]}.xlsx`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);

    return { success: true };
  }
};

export default auditLogService;
