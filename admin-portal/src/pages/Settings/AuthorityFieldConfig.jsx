import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Switch,
  FormControlLabel,
  Button,
  Grid,
  Alert,
  CircularProgress,
  Chip,
  Divider,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  Save as SaveIcon,
  Refresh as RefreshIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { useSelector } from 'react-redux';
import api from '../../services/api';

const AuthorityFieldConfig = () => {
  const { user } = useSelector((state) => state.auth);
  // Use the logged-in user's agency ID
  const agencyId = user?.Agency_ID || user?.agencyId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [fieldConfigs, setFieldConfigs] = useState({});

  useEffect(() => {
    loadFieldConfigurations();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agencyId]);

  const loadFieldConfigurations = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get(`/config/agencies/${agencyId}/authority-config/fields`);
      if (response.data.success) {
        setFieldConfigs(response.data.data.fieldConfigurations || {});
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load field configurations');
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (fieldName, property, value) => {
    setFieldConfigs(prev => ({
      ...prev,
      [fieldName]: {
        ...prev[fieldName],
        [property]: value
      }
    }));
  };

  const updateNestedConfig = (fieldName, property, value) => {
    setFieldConfigs((prev) => ({
      ...prev,
      notificationSettings: {
        ...(prev.notificationSettings || {}),
        [fieldName]: {
          ...(prev.notificationSettings?.[fieldName] || {}),
          [property]: value,
        },
      },
    }));
  };

  const updateGpsSafetyNested = (property, value) => {
    setFieldConfigs((prev) => ({
      ...prev,
      gpsSafetyAlerts: {
        ...(prev.gpsSafetyAlerts || {}),
        [property]: value,
      },
    }));
  };

  const updateGpsSafetyAlertType = (property, value) => {
    setFieldConfigs((prev) => ({
      ...prev,
      gpsSafetyAlerts: {
        ...(prev.gpsSafetyAlerts || {}),
        alertTypes: {
          ...(prev.gpsSafetyAlerts?.alertTypes || {}),
          [property]: value,
        },
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await api.put(`/config/agencies/${agencyId}/authority-config/fields`, {
        fieldConfigurations: fieldConfigs
      });

      if (response.data.success) {
        setSuccess('Authority field configurations saved successfully! Client will be notified via email.');
        setTimeout(() => setSuccess(null), 5000);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save configurations');
    } finally {
      setSaving(false);
    }
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
            Authority Field Configuration
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Customize field labels and requirements for authority data entry
          </Typography>
        </Box>
        <Box>
          <Tooltip title="Reload">
            <IconButton onClick={loadFieldConfigurations} disabled={loading}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
            onClick={handleSave}
            disabled={saving}
            sx={{ ml: 1 }}
          >
            Save Changes
          </Button>
        </Box>
      </Box>

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
          <strong>Important:</strong> Any changes to field configurations will trigger an email notification to the client (Ryan Medlin) for approval.
        </Typography>
      </Alert>

      <Grid container spacing={3}>
        {Object.entries(fieldConfigs)
          .filter(([fieldName]) => !['notificationSettings', 'gpsSafetyAlerts', 'gpsAccuracyMonitoring'].includes(fieldName))
          .map(([fieldName, config]) => (
          <Grid item xs={12} key={fieldName}>
            <Paper sx={{ p: 2, bgcolor: '#1E1E1E' }}>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} md={3}>
                  <Typography variant="subtitle1" fontWeight="bold">
                    {fieldName.replace(/([A-Z])/g, ' $1').trim()}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    Field Name: {fieldName}
                  </Typography>
                </Grid>

                <Grid item xs={12} md={3}>
                  <TextField
                    fullWidth
                    label="Display Label"
                    value={config.label || ''}
                    onChange={(e) => handleFieldChange(fieldName, 'label', e.target.value)}
                    size="small"
                  />
                </Grid>

                <Grid item xs={12} md={2}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={config.enabled || false}
                        onChange={(e) => handleFieldChange(fieldName, 'enabled', e.target.checked)}
                        color="primary"
                      />
                    }
                    label="Enabled"
                  />
                </Grid>

                <Grid item xs={12} md={2}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={config.required || false}
                        onChange={(e) => handleFieldChange(fieldName, 'required', e.target.checked)}
                        color="primary"
                        disabled={!config.enabled}
                      />
                    }
                    label="Required"
                  />
                </Grid>

                <Grid item xs={12} md={2}>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    {config.format && (
                      <Chip label={config.format} size="small" color="primary" />
                    )}
                    {config.options && (
                      <Chip label={`${config.options.length} options`} size="small" />
                    )}
                  </Box>
                </Grid>
              </Grid>

              {config.options && config.enabled && (
                <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                  <Typography variant="body2" gutterBottom>
                    Available Options:
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                    {config.options.map((option, idx) => (
                      <Chip key={idx} label={option} size="small" variant="outlined" />
                    ))}
                  </Box>
                </Box>
              )}
            </Paper>
          </Grid>
        ))}

        {fieldConfigs.notificationSettings && (
          <Grid item xs={12}>
            <Paper sx={{ p: 2, bgcolor: '#1E1E1E' }}>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                Notification Policy
              </Typography>
              <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 2 }}>
                Admin controls push, visual, audio/vibration behavior, quiet hours, and shift suppression rules.
              </Typography>

              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <FormControlLabel
                    control={(
                      <Switch
                        checked={fieldConfigs.notificationSettings.enabled !== false}
                        onChange={(e) => handleFieldChange('notificationSettings', 'enabled', e.target.checked)}
                        color="primary"
                      />
                    )}
                    label="Notifications Enabled"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <FormControlLabel
                    control={(
                      <Switch
                        checked={fieldConfigs.notificationSettings.pushEnabled !== false}
                        onChange={(e) => handleFieldChange('notificationSettings', 'pushEnabled', e.target.checked)}
                        color="primary"
                      />
                    )}
                    label="Push Enabled"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <FormControlLabel
                    control={(
                      <Switch
                        checked={fieldConfigs.notificationSettings.visualEnabled !== false}
                        onChange={(e) => handleFieldChange('notificationSettings', 'visualEnabled', e.target.checked)}
                        color="primary"
                      />
                    )}
                    label="Visual Alerts Enabled"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <FormControlLabel
                    control={(
                      <Switch
                        checked={fieldConfigs.notificationSettings.vibrationEnabled !== false}
                        onChange={(e) => handleFieldChange('notificationSettings', 'vibrationEnabled', e.target.checked)}
                        color="primary"
                      />
                    )}
                    label="Vibration Enabled"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <FormControlLabel
                    control={(
                      <Switch
                        checked={fieldConfigs.notificationSettings.audioEnabled !== false}
                        onChange={(e) => handleFieldChange('notificationSettings', 'audioEnabled', e.target.checked)}
                        color="primary"
                      />
                    )}
                    label="Audio Enabled"
                  />
                </Grid>

                <Grid item xs={12}>
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="body2" gutterBottom>
                    Quiet Hours
                  </Typography>
                </Grid>
                <Grid item xs={12} md={4}>
                  <FormControlLabel
                    control={(
                      <Switch
                        checked={fieldConfigs.notificationSettings?.quietHours?.enabled === true}
                        onChange={(e) => updateNestedConfig('quietHours', 'enabled', e.target.checked)}
                        color="primary"
                      />
                    )}
                    label="Enable Quiet Hours"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Quiet Start (HH:MM)"
                    value={fieldConfigs.notificationSettings?.quietHours?.start || ''}
                    onChange={(e) => updateNestedConfig('quietHours', 'start', e.target.value)}
                    size="small"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Quiet End (HH:MM)"
                    value={fieldConfigs.notificationSettings?.quietHours?.end || ''}
                    onChange={(e) => updateNestedConfig('quietHours', 'end', e.target.value)}
                    size="small"
                  />
                </Grid>

                <Grid item xs={12}>
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="body2" gutterBottom>
                    Shift Rules
                  </Typography>
                </Grid>
                <Grid item xs={12} md={4}>
                  <FormControlLabel
                    control={(
                      <Switch
                        checked={fieldConfigs.notificationSettings?.shiftRules?.enabled === true}
                        onChange={(e) => updateNestedConfig('shiftRules', 'enabled', e.target.checked)}
                        color="primary"
                      />
                    )}
                    label="Enable Shift Rules"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Shift Start (HH:MM)"
                    value={fieldConfigs.notificationSettings?.shiftRules?.start || ''}
                    onChange={(e) => updateNestedConfig('shiftRules', 'start', e.target.value)}
                    size="small"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Shift End (HH:MM)"
                    value={fieldConfigs.notificationSettings?.shiftRules?.end || ''}
                    onChange={(e) => updateNestedConfig('shiftRules', 'end', e.target.value)}
                    size="small"
                  />
                </Grid>
              </Grid>
            </Paper>
          </Grid>
        )}

        {fieldConfigs.gpsSafetyAlerts && (
          <Grid item xs={12}>
            <Paper sx={{ p: 2, bgcolor: '#1E1E1E' }}>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                GPS Safety Alerts
              </Typography>
              <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 2 }}>
                Configure critical GPS accuracy/signal-loss safety behavior and whether authority boundary alerts pause when location quality is low.
              </Typography>

              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <FormControlLabel
                    control={(
                      <Switch
                        checked={fieldConfigs.gpsSafetyAlerts.enabled !== false}
                        onChange={(e) => updateGpsSafetyNested('enabled', e.target.checked)}
                        color="primary"
                      />
                    )}
                    label="GPS Safety Alerts Enabled"
                  />
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Accuracy Threshold (m)"
                    value={fieldConfigs.gpsSafetyAlerts.accuracyThresholdMeters ?? 25}
                    onChange={(e) => updateGpsSafetyNested('accuracyThresholdMeters', Number(e.target.value))}
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ min: 5, max: 500 }}
                    sx={{ minWidth: 210 }}
                  />
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Critical Accuracy Threshold (m)"
                    value={fieldConfigs.gpsSafetyAlerts.criticalAccuracyThresholdMeters ?? 50}
                    onChange={(e) => updateGpsSafetyNested('criticalAccuracyThresholdMeters', Number(e.target.value))}
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ min: 5, max: 1000 }}
                    sx={{ minWidth: 210 }}
                  />
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Stale Signal After (sec)"
                    value={fieldConfigs.gpsSafetyAlerts.staleAfterSeconds ?? 20}
                    onChange={(e) => updateGpsSafetyNested('staleAfterSeconds', Number(e.target.value))}
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ min: 5, max: 600 }}
                    sx={{ minWidth: 210 }}
                  />
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Repeat Frequency (sec)"
                    value={fieldConfigs.gpsSafetyAlerts.repeatFrequencySeconds ?? 30}
                    onChange={(e) => updateGpsSafetyNested('repeatFrequencySeconds', Number(e.target.value))}
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ min: 5, max: 600 }}
                    sx={{ minWidth: 210 }}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <FormControlLabel
                    control={(
                      <Switch
                        checked={fieldConfigs.gpsSafetyAlerts.pauseAuthorityAlertsOnLowAccuracy !== false}
                        onChange={(e) => updateGpsSafetyNested('pauseAuthorityAlertsOnLowAccuracy', e.target.checked)}
                        color="primary"
                      />
                    )}
                    label="Pause Authority Alerts on Low Accuracy"
                  />
                </Grid>

                <Grid item xs={12}>
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="body2" gutterBottom>
                    Alert Types
                  </Typography>
                </Grid>
                <Grid item xs={12} md={4}>
                  <FormControlLabel
                    control={(
                      <Switch
                        checked={fieldConfigs.gpsSafetyAlerts?.alertTypes?.accuracy !== false}
                        onChange={(e) => updateGpsSafetyAlertType('accuracy', e.target.checked)}
                        color="primary"
                      />
                    )}
                    label="Accuracy Threshold Alerts"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <FormControlLabel
                    control={(
                      <Switch
                        checked={fieldConfigs.gpsSafetyAlerts?.alertTypes?.satelliteLoss !== false}
                        onChange={(e) => updateGpsSafetyAlertType('satelliteLoss', e.target.checked)}
                        color="primary"
                      />
                    )}
                    label="Satellite Loss Alerts"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <FormControlLabel
                    control={(
                      <Switch
                        checked={fieldConfigs.gpsSafetyAlerts?.alertTypes?.staleSignal !== false}
                        onChange={(e) => updateGpsSafetyAlertType('staleSignal', e.target.checked)}
                        color="primary"
                      />
                    )}
                    label="Stale Signal Alerts"
                  />
                </Grid>
              </Grid>
            </Paper>
          </Grid>
        )}
      </Grid>

      <Divider sx={{ my: 4 }} />

      <Box sx={{ textAlign: 'center' }}>
        <Button
          variant="contained"
          size="large"
          startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
          onClick={handleSave}
          disabled={saving}
        >
          Save All Changes
        </Button>
      </Box>
    </Box>
  );
};

export default AuthorityFieldConfig;
