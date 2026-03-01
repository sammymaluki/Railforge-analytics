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
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import {
  Save as SaveIcon,
  Refresh as RefreshIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { useSelector } from 'react-redux';
import api from '../../services/api';
import { isGlobalAdmin } from '../../utils/rbac';

const AlertDistanceConfig = () => {
  const { user } = useSelector((state) => state.auth);
  const globalAdmin = isGlobalAdmin(user);
  
  // For Global Admins, allow selecting agency; for others, use their own agency
  const defaultAgencyId = user?.Agency_ID || user?.agencyId;
  const [selectedAgencyId, setSelectedAgencyId] = useState(defaultAgencyId);
  const [agencies, setAgencies] = useState([]);
  
  // The agency ID to use for API calls
  const agencyId = globalAdmin ? selectedAgencyId : defaultAgencyId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [configurations, setConfigurations] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState(null);

  const [formData, setFormData] = useState({
    configType: 'Proximity_Alert',
    alertLevel: 'Warning',
    distanceMiles: 0.25,
    timeMinutes: null,
    speedMph: null,
    isEnabled: true,
    description: ''
  });

  // Load agencies for Global Admins
  useEffect(() => {
    if (globalAdmin) {
      loadAgencies();
    }
  }, [globalAdmin]);

  // Reload configurations when agency changes
  useEffect(() => {
    if (agencyId) {
      loadConfigurations();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agencyId]);

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

  const loadConfigurations = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get(`/alerts/config/${agencyId}`);
      if (response.data.success) {
        setConfigurations(response.data.data.configurations || []);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load alert configurations');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (config = null) => {
    if (config) {
      setEditingConfig(config);
      setFormData({
        configType: config.Config_Type,
        alertLevel: config.Alert_Level,
        distanceMiles: config.Distance_Miles,
        timeMinutes: config.Time_Minutes,
        speedMph: config.Speed_MPH,
        isEnabled: config.Is_Enabled,
        description: config.Description || ''
      });
    } else {
      setEditingConfig(null);
      setFormData({
        configType: 'Proximity_Alert',
        alertLevel: 'Warning',
        distanceMiles: 0.25,
        timeMinutes: null,
        speedMph: null,
        isEnabled: true,
        description: ''
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingConfig(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const normalizedAlertLevel = (() => {
        const raw = String(formData.alertLevel || '').toLowerCase();
        if (raw === 'critical') return 'Critical';
        if (raw === 'warning') return 'Warning';
        return 'Informational';
      })();

      const payload = {
        ...formData,
        alertLevel: normalizedAlertLevel,
        message: formData.description || '',
      };

      if (!editingConfig) {
        const duplicate = configurations.find((cfg) =>
          String(cfg.Config_Type || '').toLowerCase() === String(payload.configType || '').toLowerCase() &&
          String(cfg.Alert_Level || '').toLowerCase() === String(payload.alertLevel || '').toLowerCase()
        );

        if (duplicate) {
          setError('A configuration with this type and alert level already exists for the selected agency. Edit the existing row instead of creating a duplicate.');
          setSaving(false);
          return;
        }
      }

      let response;
      if (editingConfig) {
        response = await api.put(
          `/config/agencies/${agencyId}/alert-configs/${editingConfig.Config_ID}`,
          payload
        );
      } else {
        response = await api.post(`/config/agencies/${agencyId}/alert-configs`, payload);
      }

      if (response.data.success) {
        setSuccess(
          editingConfig 
            ? 'Alert configuration updated successfully! Client will be notified via email.'
            : 'Alert configuration created successfully! Client will be notified via email.'
        );
        handleCloseDialog();
        loadConfigurations();
        setTimeout(() => setSuccess(null), 5000);
      }
    } catch (err) {
      if (err.response?.status === 409) {
        setError(
          err.response?.data?.message ||
            'Duplicate configuration detected. Edit the existing row instead of creating a duplicate.'
        );
      } else {
        setError(err.response?.data?.message || 'Failed to save configuration');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (configId) => {
    if (!window.confirm('Are you sure you want to delete this alert configuration?')) {
      return;
    }

    try {
      const response = await api.delete(`/config/agencies/${agencyId}/alert-configs/${configId}`);
      if (response.data.success) {
        setSuccess('Alert configuration deleted successfully!');
        loadConfigurations();
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete configuration');
    }
  };

  const getAlertLevelColor = (level) => {
    const normalized = String(level || '').toLowerCase();
    if (normalized === 'critical') return 'error';
    if (normalized === 'warning') return 'warning';
    if (normalized === 'info' || normalized === 'informational') return 'info';
    return 'default';
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h6" gutterBottom>
            Alert Distance Configuration
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Configure proximity alert thresholds (0.25, 0.5, 0.75, 1.0 mile ranges)
          </Typography>
        </Box>
        <Box>
          <Tooltip title="Reload">
            <IconButton onClick={loadConfigurations} disabled={loading}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
            sx={{ ml: 1 }}
          >
            Add Alert Config
          </Button>
        </Box>
      </Box>

      {/* Agency Selector - Only for Global Admins */}
      {globalAdmin && agencies.length > 0 && (
        <Paper sx={{ p: 2, mb: 3, bgcolor: '#1E1E1E', borderLeft: '4px solid #FFD100' }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Select Agency to Configure</InputLabel>
                <Select
                  value={selectedAgencyId || ''}
                  label="Select Agency to Configure"
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
              <Alert severity="info" icon={<InfoIcon />} sx={{ mb: 0 }}>
                <Typography variant="caption">
                  <strong>Global Admin Mode:</strong> You're configuring alerts for the selected agency.
                </Typography>
              </Alert>
            </Grid>
          </Grid>
        </Paper>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <Alert severity="info" sx={{ mb: 3 }} icon={<InfoIcon />}>
        <Typography variant="body2">
          <strong>Client Requirement:</strong> Standard proximity distances are 0.25, 0.5, 0.75, and 1.0 miles. 
          All threshold changes require client approval and will trigger email notification.
        </Typography>
      </Alert>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: '#FFD100' }}>
              <TableCell><strong>Config Type</strong></TableCell>
              <TableCell><strong>Alert Level</strong></TableCell>
              <TableCell><strong>Distance (Miles)</strong></TableCell>
              <TableCell><strong>Time (Minutes)</strong></TableCell>
              <TableCell><strong>Status</strong></TableCell>
              <TableCell><strong>Description</strong></TableCell>
              <TableCell align="center"><strong>Actions</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {configurations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 5 }}>
                  <Typography color="textSecondary">
                    No alert configurations found. Click "Add Alert Config" to create one.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              configurations.map((config) => (
                <TableRow key={config.Config_ID} hover>
                  <TableCell>{config.Config_Type}</TableCell>
                  <TableCell>
                    <Chip
                      label={config.Alert_Level}
                      color={getAlertLevelColor(config.Alert_Level)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {config.Distance_Miles ? `${config.Distance_Miles} mi` : 'N/A'}
                  </TableCell>
                  <TableCell>
                    {config.Time_Minutes ? `${config.Time_Minutes} min` : 'N/A'}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={config.Is_Enabled ? 'Enabled' : 'Disabled'}
                      color={config.Is_Enabled ? 'success' : 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{config.Description || 'N/A'}</TableCell>
                  <TableCell align="center">
                    <Tooltip title="Edit">
                      <IconButton 
                        size="small" 
                        onClick={() => handleOpenDialog(config)}
                        color="primary"
                      >
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton 
                        size="small" 
                        onClick={() => handleDelete(config.Config_ID)}
                        color="error"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingConfig ? 'Edit Alert Configuration' : 'Add Alert Configuration'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 3, mb: 2 }}>
            <Alert severity="info" variant="outlined" sx={{ mb: 3 }}>
              <Typography variant="body2">
                <strong>Standard distances:</strong> 0.25, 0.5, 0.75, 1.0 miles
              </Typography>
            </Alert>
          </Box>
          <Grid container spacing={3} sx={{ mt: 0 }}>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Alert Type *</InputLabel>
                <Select
                  value={formData.configType}
                  label="Alert Type"
                  onChange={(e) => setFormData({ ...formData, configType: e.target.value })}
                  sx={{ height: 56 }}
                >
                  <MenuItem value="Proximity_Alert">Proximity Alert (Distance-based)</MenuItem>
                  <MenuItem value="Boundary_Alert">Boundary Alert (Authority limits)</MenuItem>
                  <MenuItem value="Overlap_Alert">Overlap Alert (Authority conflict)</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Severity Level *</InputLabel>
                <Select
                  value={formData.alertLevel}
                  label="Severity Level"
                  onChange={(e) => setFormData({ ...formData, alertLevel: e.target.value })}
                  sx={{ height: 56 }}
                >
                  <MenuItem value="Informational">Informational (Low)</MenuItem>
                  <MenuItem value="Warning">Warning (Medium)</MenuItem>
                  <MenuItem value="Critical">Critical (High)</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Distance (Miles)"
                type="number"
                value={formData.distanceMiles || ''}
                onChange={(e) => setFormData({ ...formData, distanceMiles: parseFloat(e.target.value) })}
                inputProps={{ step: 0.25, min: 0 }}
                helperText="e.g., 0.25, 0.5, 0.75, 1.0"
                variant="outlined"
                size="medium"
              />
            </Grid>

            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Duration (Minutes)"
                type="number"
                value={formData.timeMinutes || ''}
                onChange={(e) => setFormData({ ...formData, timeMinutes: parseInt(e.target.value) || null })}
                inputProps={{ min: 0 }}
                helperText="Optional - leave blank if N/A"
                variant="outlined"
                size="medium"
              />
            </Grid>


            <Grid item xs={12} md={8}>
              <TextField
                fullWidth
                label="Description / Notes"
                multiline
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                helperText="Internal notes about this configuration"
                variant="outlined"
              />
            </Grid>

            <Grid item xs={12} md={4}>
              <FormControl fullWidth sx={{ minWidth: 220 }}>
                <InputLabel>Status *</InputLabel>
                <Select
                  value={formData.isEnabled}
                  label="Status"
                  onChange={(e) => setFormData({ ...formData, isEnabled: e.target.value })}
                  sx={{ height: 56, minWidth: 220 }}
                >
                  <MenuItem value={true}>✓ Enabled</MenuItem>
                  <MenuItem value={false}>✗ Disabled</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
          >
            {editingConfig ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AlertDistanceConfig;
