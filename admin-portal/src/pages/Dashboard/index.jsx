import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  IconButton,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  TrendingUp,
  Warning,
  People,
  Assignment,
  PushPin,
  Shield,
  CheckCircle
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import analyticsService from '../../services/analyticsService';
import api from '../../services/api';

const Dashboard = () => {
  const navigate = useNavigate();
  const agencyId = 1; // DEFAULT agency
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [recentAlerts, setRecentAlerts] = useState([]);
  const [recentAuthorities, setRecentAuthorities] = useState([]);
  const [recentAuditLogs, setRecentAuditLogs] = useState([]);

  const loadDashboardData = async (forceRefresh = false) => {
    try {
      if (forceRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      // Load dashboard stats
      const statsResponse = await analyticsService.getDashboardStats(agencyId, { forceRefresh });
      setStats(statsResponse.data);

      // Load recent alerts (last 5)
      const alertsResponse = await api.get(`/alerts/${agencyId}/history?limit=5&sortBy=createdAt&sortOrder=desc`);
      setRecentAlerts(alertsResponse.data.data?.alerts || []);

      // Load recent authorities (last 5)
      const authoritiesResponse = await api.get(`/authorities/history/${agencyId}?limit=5&sortBy=createdAt&sortOrder=desc`);
      setRecentAuthorities(authoritiesResponse.data.data?.authorities || []);

      // Load recent audit logs (last 5)
      const auditResponse = await api.get(`/audit/${agencyId}/logs?limit=5&sortBy=createdAt&sortOrder=desc`);
      setRecentAuditLogs(auditResponse.data.data?.logs || []);

    } catch (err) {
      console.error('Dashboard load error:', err);
      setError(err.response?.data?.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const handleRefresh = () => {
    loadDashboardData(true);
  };

  const getAlertSeverityColor = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'critical': return 'error';
      case 'high': return 'warning';
      case 'medium': return 'info';
      case 'low': return 'success';
      default: return 'default';
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'active': return 'success';
      case 'pending': return 'warning';
      case 'expired': return 'error';
      case 'cancelled': return 'default';
      default: return 'default';
    }
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString();
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant='h4'>Dashboard</Typography>
        <IconButton 
          onClick={handleRefresh} 
          disabled={refreshing}
          color="primary"
        >
          <RefreshIcon />
        </IconButton>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Statistics Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* Total Authorities */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="text.secondary" variant="body2">
                    Total Authorities
                  </Typography>
                  <Typography variant="h4">
                    {stats?.authorityStats?.total_authorities || 0}
                  </Typography>
                  <Typography variant="caption" color="success.main">
                    {stats?.authorityStats?.active_authorities || 0} Active
                  </Typography>
                </Box>
                <Assignment sx={{ fontSize: 48, color: 'primary.main', opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Active Users */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="text.secondary" variant="body2">
                    Active Users
                  </Typography>
                  <Typography variant="h4">
                    {stats?.userStats?.active_users || 0}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Total: {stats?.userStats?.total_users || 0}
                  </Typography>
                </Box>
                <People sx={{ fontSize: 48, color: 'success.main', opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Alerts Today */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="text.secondary" variant="body2">
                    Alerts Today
                  </Typography>
                  <Typography variant="h4">
                    {stats?.alertStats?.alerts_today || 0}
                  </Typography>
                  <Typography variant="caption" color="warning.main">
                    {stats?.alertStats?.critical_alerts || 0} Critical
                  </Typography>
                </Box>
                <Warning sx={{ fontSize: 48, color: 'warning.main', opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* System Health */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="text.secondary" variant="body2">
                    System Status
                  </Typography>
                  <Typography variant="h4">
                    {stats?.systemStats?.database_status === 'healthy' ? '✓' : '✗'}
                  </Typography>
                  <Typography variant="caption" color="success.main">
                    All Systems Online
                  </Typography>
                </Box>
                <CheckCircle sx={{ fontSize: 48, color: 'success.main', opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Recent Activity Grid */}
      <Grid container spacing={3}>
        {/* Recent Authorities */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">Recent Authorities</Typography>
              <Button 
                size="small" 
                onClick={() => navigate('/authorities')}
              >
                View All
              </Button>
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Number</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Created</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {recentAuthorities.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} align="center">
                        <Typography variant="body2" color="text.secondary">
                          No authorities found
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    recentAuthorities.map((authority, idx) => (
                      <TableRow 
                        key={authority.Authority_ID || `auth-${idx}`}
                        hover
                        sx={{ cursor: 'pointer' }}
                        onClick={() => navigate(`/authorities/${authority.Authority_ID}`)}
                      >
                        <TableCell>{authority.Authority_ID || 'N/A'}</TableCell>
                        <TableCell>
                          <Chip 
                            label={authority.Status || 'Unknown'} 
                            size="small" 
                            color={getStatusColor(authority.Status)}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption">
                            {formatDate(authority.Created_Date)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        {/* Recent Alerts */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">Recent Alerts</Typography>
              <Button 
                size="small" 
                onClick={() => navigate('/alerts')}
              >
                View All
              </Button>
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Type</TableCell>
                    <TableCell>Severity</TableCell>
                    <TableCell>Created</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {recentAlerts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} align="center">
                        <Typography variant="body2" color="text.secondary">
                          No alerts found
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    recentAlerts.map((alert, idx) => (
                      <TableRow key={alert.Alert_ID || `alert-${idx}`} hover>
                        <TableCell>{alert.Alert_Type || 'N/A'}</TableCell>
                        <TableCell>
                          <Chip 
                            label={alert.Alert_Level || 'Unknown'} 
                            size="small" 
                            color={getAlertSeverityColor(alert.Alert_Level)}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption">
                            {formatDate(alert.Created_Date)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        {/* Recent Audit Logs */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">Recent Activity</Typography>
              <Button 
                size="small" 
                onClick={() => navigate('/audit-logs')}
              >
                View All
              </Button>
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Action</TableCell>
                    <TableCell>Entity Type</TableCell>
                    <TableCell>User</TableCell>
                    <TableCell>Details</TableCell>
                    <TableCell>Timestamp</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {recentAuditLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        <Typography variant="body2" color="text.secondary">
                          No recent activity
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    recentAuditLogs.map((log, idx) => (
                      <TableRow key={log.Log_ID || `log-${idx}`} hover>
                        <TableCell>
                          <Chip 
                            label={log.Action_Type || 'N/A'} 
                            size="small" 
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>{log.Table_Name || 'N/A'}</TableCell>
                        <TableCell>{log.Employee_Name || 'System'}</TableCell>
                        <TableCell>
                          <Typography variant="caption" sx={{ 
                            maxWidth: 300, 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            display: 'block'
                          }}>
                            {log.Details || 'No details'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption">
                            {formatDate(log.Created_Date)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;
