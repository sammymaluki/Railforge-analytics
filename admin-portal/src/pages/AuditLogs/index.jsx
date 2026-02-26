import React, { useState, useEffect } from 'react';
import {
  Container,
  Paper,
  Typography,
  Box,
  TextField,
  MenuItem,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  IconButton,
  Chip,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  Switch,
  FormControlLabel,
  Divider
} from '@mui/material';
import {
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  FilterList as FilterIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import auditLogService from '../../services/auditLogService';
import { useSelector } from 'react-redux';

const AuditLogs = () => {
  const { user } = useSelector((state) => state.auth);
  const agencyId = Number(user?.Agency_ID || user?.agencyId || 1);

  // State
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [actionTypes, setActionTypes] = useState([]);
  const [affectedTables, setAffectedTables] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [retentionPolicy, setRetentionPolicy] = useState(null);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [runningRetention, setRunningRetention] = useState(false);

  // Pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [totalRecords, setTotalRecords] = useState(0);

  // Filters
  const [filters, setFilters] = useState({
    startDate: format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    actionType: 'all',
    tableName: 'all',
    userId: '',
    sortBy: 'Created_Date',
    sortOrder: 'DESC'
  });

  // Load initial data
  useEffect(() => {
    loadActionTypes();
    loadAffectedTables();
    loadStats();
    loadRetentionPolicy();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load logs when filters or pagination change
  useEffect(() => {
    loadLogs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, page, rowsPerPage]);

  const loadLogs = async () => {
    if (!agencyId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await auditLogService.getAuditLogs(agencyId, {
        ...filters,
        page: page + 1,
        limit: rowsPerPage
      });

      if (response.success) {
        setLogs(response.data.logs);
        setTotalRecords(response.data.pagination.total);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    if (!agencyId) return;

    try {
      const response = await auditLogService.getAuditLogStats(agencyId, {
        startDate: filters.startDate,
        endDate: filters.endDate
      });

      if (response.success) {
        setStats(response.data);
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const loadActionTypes = async () => {
    if (!agencyId) return;

    try {
      const response = await auditLogService.getActionTypes(agencyId);
      if (response.success) {
        setActionTypes(response.data);
      }
    } catch (err) {
      console.error('Failed to load action types:', err);
    }
  };

  const loadAffectedTables = async () => {
    if (!agencyId) return;

    try {
      const response = await auditLogService.getAffectedTables(agencyId);
      if (response.success) {
        setAffectedTables(response.data);
      }
    } catch (err) {
      console.error('Failed to load affected tables:', err);
    }
  };

  const loadRetentionPolicy = async () => {
    if (!agencyId) return;
    try {
      const response = await auditLogService.getRetentionPolicy(agencyId);
      if (response.success) {
        setRetentionPolicy(response.data);
      }
    } catch (err) {
      console.error('Failed to load retention policy:', err);
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
    setPage(0); // Reset to first page when filters change
  };

  const handleRefresh = () => {
    loadLogs();
    loadStats();
    loadRetentionPolicy();
  };

  const handleRetentionFieldChange = (field, value) => {
    setRetentionPolicy((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveRetentionPolicy = async () => {
    if (!retentionPolicy) return;
    setSavingPolicy(true);
    try {
      const response = await auditLogService.updateRetentionPolicy(agencyId, {
        auditLogRetentionDays: Number(retentionPolicy.auditLogRetentionDays),
        alertLogRetentionDays: Number(retentionPolicy.alertLogRetentionDays),
        gpsLogRetentionDays: Number(retentionPolicy.gpsLogRetentionDays),
        sessionLogRetentionDays: Number(retentionPolicy.sessionLogRetentionDays),
        isEnabled: Boolean(retentionPolicy.isEnabled)
      });
      if (response.success) {
        setRetentionPolicy(response.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update retention policy');
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleRunRetentionCleanup = async () => {
    setRunningRetention(true);
    try {
      const response = await auditLogService.runRetentionCleanup(agencyId);
      if (response.success) {
        await loadRetentionPolicy();
        setError(null);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to run retention cleanup');
    } finally {
      setRunningRetention(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await auditLogService.exportAuditLogs(agencyId, filters);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to export audit logs');
    } finally {
      setExporting(false);
    }
  };

  const handleChangePage = (_event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const getActionTypeColor = (actionType) => {
    const colorMap = {
      'CREATE': 'success',
      'UPDATE': 'info',
      'DELETE': 'error',
      'LOGIN': 'default',
      'LOGOUT': 'default',
      'EXPORT': 'warning'
    };
    return colorMap[actionType] || 'default';
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return format(new Date(dateString), 'MMM dd, yyyy HH:mm:ss');
  };

  const truncateText = (text, maxLength = 50) => {
    if (!text) return 'N/A';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" component="h1">
          System Audit Logs
        </Typography>
        <Box>
          <Tooltip title="Refresh Data">
            <IconButton onClick={handleRefresh} disabled={loading}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={exporting ? <CircularProgress size={20} /> : <DownloadIcon />}
            onClick={handleExport}
            disabled={exporting || loading}
            sx={{ ml: 1 }}
          >
            Export to Excel
          </Button>
        </Box>
      </Box>

      {/* Statistics Cards */}
      {stats && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Total Logs
                </Typography>
                <Typography variant="h4">
                  {stats.total_logs?.toLocaleString() || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Unique Users
                </Typography>
                <Typography variant="h4">
                  {stats.unique_users || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Last 24 Hours
                </Typography>
                <Typography variant="h4">
                  {stats.last_24h_count?.toLocaleString() || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Last 7 Days
                </Typography>
                <Typography variant="h4">
                  {stats.last_7d_count?.toLocaleString() || 0}
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
              <InputLabel>Action Type</InputLabel>
              <Select
                value={filters.actionType}
                label="Action Type"
                onChange={(e) => handleFilterChange('actionType', e.target.value)}
              >
                <MenuItem value="all">All Actions</MenuItem>
                {actionTypes.map((type) => (
                  <MenuItem key={type} value={type}>
                    {type}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <FormControl fullWidth>
              <InputLabel>Table Name</InputLabel>
              <Select
                value={filters.tableName}
                label="Table Name"
                onChange={(e) => handleFilterChange('tableName', e.target.value)}
              >
                <MenuItem value="all">All Tables</MenuItem>
                {affectedTables.map((table) => (
                  <MenuItem key={table} value={table}>
                    {table}
                  </MenuItem>
                ))}
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
          <Grid item xs={12} sm={6} md={2}>
            <FormControl fullWidth>
              <InputLabel>Sort By</InputLabel>
              <Select
                value={filters.sortBy}
                label="Sort By"
                onChange={(e) => handleFilterChange('sortBy', e.target.value)}
              >
                <MenuItem value="Created_Date">Date</MenuItem>
                <MenuItem value="Action_Type">Action Type</MenuItem>
                <MenuItem value="Table_Name">Table Name</MenuItem>
                <MenuItem value="Username">Username</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {/* Retention Policy */}
      {retentionPolicy && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Audit Retention Policy</Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                onClick={handleRunRetentionCleanup}
                disabled={runningRetention || savingPolicy}
              >
                {runningRetention ? 'Running Cleanup...' : 'Run Cleanup Now'}
              </Button>
              <Button
                variant="contained"
                onClick={handleSaveRetentionPolicy}
                disabled={savingPolicy || runningRetention}
              >
                {savingPolicy ? 'Saving...' : 'Save Policy'}
              </Button>
            </Box>
          </Box>
          <Divider sx={{ mb: 2 }} />
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                fullWidth
                type="number"
                label="Audit Logs (days)"
                value={retentionPolicy.auditLogRetentionDays ?? 365}
                onChange={(e) => handleRetentionFieldChange('auditLogRetentionDays', e.target.value)}
                inputProps={{ min: 1, max: 3650 }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                fullWidth
                type="number"
                label="Alert Logs (days)"
                value={retentionPolicy.alertLogRetentionDays ?? 180}
                onChange={(e) => handleRetentionFieldChange('alertLogRetentionDays', e.target.value)}
                inputProps={{ min: 1, max: 3650 }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                fullWidth
                type="number"
                label="GPS Logs (days)"
                value={retentionPolicy.gpsLogRetentionDays ?? 90}
                onChange={(e) => handleRetentionFieldChange('gpsLogRetentionDays', e.target.value)}
                inputProps={{ min: 1, max: 3650 }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                fullWidth
                type="number"
                label="Session Logs (days)"
                value={retentionPolicy.sessionLogRetentionDays ?? 90}
                onChange={(e) => handleRetentionFieldChange('sessionLogRetentionDays', e.target.value)}
                inputProps={{ min: 1, max: 3650 }}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={(
                  <Switch
                    checked={Boolean(retentionPolicy.isEnabled)}
                    onChange={(e) => handleRetentionFieldChange('isEnabled', e.target.checked)}
                  />
                )}
                label="Retention cleanup enabled"
              />
            </Grid>
          </Grid>
        </Paper>
      )}

      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Audit Logs Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: '#FFD100' }}>
              <TableCell><strong>Date/Time</strong></TableCell>
              <TableCell><strong>User</strong></TableCell>
              <TableCell><strong>Action</strong></TableCell>
              <TableCell><strong>Table</strong></TableCell>
              <TableCell><strong>Record ID</strong></TableCell>
              <TableCell><strong>Old Value</strong></TableCell>
              <TableCell><strong>New Value</strong></TableCell>
              <TableCell><strong>IP Address</strong></TableCell>
              <TableCell><strong>Device</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} align="center" sx={{ py: 5 }}>
                  <CircularProgress />
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} align="center" sx={{ py: 5 }}>
                  <Typography color="textSecondary">
                    No audit logs found for the selected filters
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.Audit_ID} hover>
                  <TableCell>{formatDate(log.Created_Date)}</TableCell>
                  <TableCell>
                    <Box>
                      <Typography variant="body2">{log.Employee_Name_Display || 'N/A'}</Typography>
                      <Typography variant="caption" color="textSecondary">
                        {log.Username}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={log.Action_Type}
                      color={getActionTypeColor(log.Action_Type)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{log.Table_Name || 'N/A'}</TableCell>
                  <TableCell>{log.Record_ID || 'N/A'}</TableCell>
                  <TableCell>
                    <Tooltip title={log.Old_Value || 'N/A'}>
                      <span>{truncateText(log.Old_Value)}</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Tooltip title={log.New_Value || 'N/A'}>
                      <span>{truncateText(log.New_Value)}</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell>{log.IP_Address || 'N/A'}</TableCell>
                  <TableCell>
                    <Tooltip title={log.Device_Info || 'N/A'}>
                      <span>{truncateText(log.Device_Info, 30)}</span>
                    </Tooltip>
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
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </TableContainer>
    </Container>
  );
};

export default AuditLogs;
