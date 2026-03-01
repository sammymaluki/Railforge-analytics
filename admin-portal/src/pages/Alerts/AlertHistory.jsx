import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Grid,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Card,
  CardContent
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Download as DownloadIcon,
  FilterList as FilterIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import { useSelector } from 'react-redux';
import api from '../../services/api';
import { isGlobalAdmin } from '../../utils/rbac';

const AlertHistory = () => {
  const { user } = useSelector((state) => state.auth);
  const globalAdmin = isGlobalAdmin(user);
  
  // For Global Admins, allow selecting agency; for others, use their own agency
  const defaultAgencyId = user?.Agency_ID || user?.agencyId;
  const [selectedAgencyId, setSelectedAgencyId] = useState(defaultAgencyId);
  const [agencies, setAgencies] = useState([]);
  
  // The agency ID to use for API calls
  const agencyId = globalAdmin ? selectedAgencyId : defaultAgencyId;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState(null);
  
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [totalRecords, setTotalRecords] = useState(0);

  const [filters, setFilters] = useState({
    startDate: format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    alertType: 'all',
    alertLevel: 'all',
    userId: ''
  });

  // Load agencies for Global Admins
  useEffect(() => {
    if (globalAdmin) {
      loadAgencies();
    }
  }, [globalAdmin]);

  // Reload data when agency or filters change
  useEffect(() => {
    if (agencyId) {
      loadAlerts();
      loadStats();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agencyId, filters, page, rowsPerPage]);

  const loadAgencies = async () => {
    try {
      const response = await api.get('/agencies');
      if (response.data.success) {
        setAgencies(response.data.data.agencies || []);
      }
    } catch (err) {
      console.error('Failed to load agencies:', err);
    }
  };

  const loadAlerts = async () => {
    setLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams({
        ...filters,
        page: page + 1,
        limit: rowsPerPage
      });

      if (filters.alertType === 'all') queryParams.delete('alertType');
      if (filters.alertLevel === 'all') queryParams.delete('alertLevel');
      if (!filters.userId || filters.userId === '') queryParams.delete('userId');

      const response = await api.get(`/alerts/${agencyId}/history?${queryParams.toString()}`);
      
      if (response.data.success) {
        setAlerts(response.data.data.alerts || []);
        setTotalRecords(response.data.data.pagination?.total || 0);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load alert history');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await api.get(`/alerts/stats/${agencyId}?startDate=${filters.startDate}&endDate=${filters.endDate}`);
      if (response.data.success) {
        const rawStats = response.data.data;
        
        // Process summary data to calculate totals
        const summary = rawStats.summary || [];
        const processedStats = {
          total_alerts: summary.reduce((sum, item) => sum + item.count, 0),
          critical_alerts: summary
            .filter(item => item.Alert_Level === 'Critical')
            .reduce((sum, item) => sum + item.count, 0),
          proximity_alerts: summary
            .filter(item => item.Alert_Type === 'Proximity')
            .reduce((sum, item) => sum + item.count, 0),
          overlap_alerts: summary
            .filter(item => item.Alert_Type === 'Overlap_Detected')
            .reduce((sum, item) => sum + item.count, 0),
          summary: summary,
          trend: rawStats.trend || []
        };
        
        setStats(processedStats);
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
    setPage(0);
  };

  const handleExport = async () => {
    try {
      const queryParams = new URLSearchParams(filters);
      const response = await api.get(`/alerts/${agencyId}/export?${queryParams.toString()}`, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `alert_history_${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to export alert history');
    }
  };

  const getAlertTypeColor = (type) => {
    const colors = {
      'PROXIMITY': 'warning',
      'BOUNDARY': 'error',
      'OVERLAP': 'error',
      'TIME': 'info',
      'SPEED': 'warning'
    };
    return colors[type] || 'default';
  };

  const getAlertLevelColor = (level) => {
    const colors = {
      'critical': 'error',
      'warning': 'warning',
      'informational': 'info'
    };
    return colors[level] || 'default';
  };

  const getAlertTypeLocation = (alert) => {
    // For proximity and boundary alerts, show the descriptive location
    if (alert.Alert_Type === 'Overlap_Detected') {
      return 'Track Overlap Area';
    } else if (alert.Alert_Type === 'Proximity') {
      return 'Worker Proximity Zone';
    } else if (alert.Alert_Type === 'Boundary_Exit') {
      return 'Authority Boundary';
    } else if (alert.Alert_Type === 'Boundary_Approach') {
      return 'Approaching Boundary';
    }
    // For system alerts, show the alert reason from the message
    if (alert.Alert_Type === 'Location_Unreliable') {
      return 'Location Unreliable';
    } else if (alert.Alert_Type === 'GPS_Signal_Lost') {
      return 'Signal Lost';
    } else if (alert.Alert_Type === 'GPS_Accuracy') {
      return 'Accuracy Issue';
    } else if (alert.Alert_Type === 'GPS_Stale') {
      return 'Stale Signal';
    }
    return 'N/A';
  };

  const shouldShowDistance = (alertType) => {
    // Only show distance for proximity and boundary alerts
    return ['Proximity', 'Boundary_Exit', 'Boundary_Approach', 'Overlap_Detected'].includes(alertType);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6">Alert History</Typography>
        <Box>
          <Tooltip title="Refresh">
            <IconButton onClick={loadAlerts} disabled={loading}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<DownloadIcon />}
            onClick={handleExport}
            sx={{ ml: 1 }}
          >
            Export to Excel
          </Button>
        </Box>
      </Box>

      {/* Agency Selector - Only for Global Admins */}
      {globalAdmin && agencies.length > 0 && (
        <Paper sx={{ p: 2, mb: 3, bgcolor: '#1E1E1E', borderLeft: '4px solid #FFD100' }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Select Agency to View</InputLabel>
                <Select
                  value={selectedAgencyId || ''}
                  label="Select Agency to View"
                  onChange={(e) => setSelectedAgencyId(e.target.value)}
                  sx={{ height: 56, bgcolor: '#121212' }}
                >
                  {agencies.map((agency) => (
                    <MenuItem 
                      key={agency.Agency_ID} 
                      value={agency.Agency_ID}
                    >
                      {agency.Agency_Name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <Alert severity="info" icon={false} sx={{ mb: 0 }}>
                <Typography variant="caption">
                  <strong>Global Admin Mode:</strong> Viewing alert history for the selected agency.
                </Typography>
              </Alert>
            </Grid>
          </Grid>
        </Paper>
      )}

      {/* Statistics Cards */}
      {stats && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Total Alerts
                </Typography>
                <Typography variant="h4">
                  {stats.total_alerts?.toLocaleString() || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Critical Alerts
                </Typography>
                <Typography variant="h4" color="error.main">
                  {stats.critical_alerts || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Proximity Alerts
                </Typography>
                <Typography variant="h4">
                  {stats.proximity_alerts || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Overlaps Detected
                </Typography>
                <Typography variant="h4" color="error.main">
                  {stats.overlap_alerts || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <FilterIcon sx={{ mr: 1 }} />
          <Typography variant="h6">Filters</Typography>
        </Box>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              fullWidth
              label="Start Date"
              type="date"
              value={filters.startDate}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              fullWidth
              label="End Date"
              type="date"
              value={filters.endDate}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <FormControl fullWidth>
              <InputLabel>Alert Type</InputLabel>
              <Select
                value={filters.alertType}
                label="Alert Type"
                onChange={(e) => handleFilterChange('alertType', e.target.value)}
              >
                <MenuItem value="all">All Types</MenuItem>
                <MenuItem value="PROXIMITY">Proximity</MenuItem>
                <MenuItem value="BOUNDARY">Boundary</MenuItem>
                <MenuItem value="OVERLAP">Overlap</MenuItem>
                <MenuItem value="TIME">Time</MenuItem>
                <MenuItem value="SPEED">Speed</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <FormControl fullWidth>
              <InputLabel>Alert Level</InputLabel>
              <Select
                value={filters.alertLevel}
                label="Alert Level"
                onChange={(e) => handleFilterChange('alertLevel', e.target.value)}
              >
                <MenuItem value="all">All Levels</MenuItem>
                <MenuItem value="critical">Critical</MenuItem>
                <MenuItem value="warning">Warning</MenuItem>
                <MenuItem value="informational">Informational</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              fullWidth
              label="User ID"
              type="number"
              value={filters.userId}
              onChange={(e) => handleFilterChange('userId', e.target.value)}
              placeholder="Filter by user..."
            />
          </Grid>
        </Grid>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Alerts Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: '#FFD100' }}>
              <TableCell><strong>Date/Time</strong></TableCell>
              <TableCell><strong>Alert Type</strong></TableCell>
              <TableCell><strong>Level</strong></TableCell>
              <TableCell><strong>User</strong></TableCell>
              <TableCell><strong>Message</strong></TableCell>
              <TableCell><strong>Location</strong></TableCell>
              <TableCell><strong>Distance</strong></TableCell>
              <TableCell><strong>Status</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 5 }}>
                  <CircularProgress />
                </TableCell>
              </TableRow>
            ) : alerts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 5 }}>
                  <Typography color="textSecondary">
                    No alerts found for the selected filters
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              alerts.map((alert) => (
                <TableRow key={alert.Alert_Log_ID} hover>
                  <TableCell>
                    {alert.Created_Date ? format(new Date(alert.Created_Date), 'MMM dd, yyyy HH:mm:ss') : 'N/A'}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={alert.Alert_Type}
                      color={getAlertTypeColor(alert.Alert_Type)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={alert.Alert_Level}
                      color={getAlertLevelColor(alert.Alert_Level)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{alert.Employee_Name || 'N/A'}</TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 250 }}>
                      {alert.Message || 'N/A'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {getAlertTypeLocation(alert)}
                  </TableCell>
                  <TableCell>
                    {shouldShowDistance(alert.Alert_Type)
                      ? alert.Triggered_Distance 
                        ? `${alert.Triggered_Distance} mi`
                        : 'N/A'
                      : '-'}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={alert.Is_Read ? 'Read' : 'Unread'}
                      color={alert.Is_Read ? 'default' : 'warning'}
                      size="small"
                      variant={alert.Is_Read ? 'outlined' : 'filled'}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <TablePagination
          rowsPerPageOptions={[25, 50, 100, 200]}
          component="div"
          count={totalRecords}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={(_e, newPage) => setPage(newPage)}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
        />
      </TableContainer>
    </Box>
  );
};

export default AlertHistory;
