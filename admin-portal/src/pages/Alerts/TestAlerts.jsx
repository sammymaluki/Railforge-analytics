import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Grid,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  CircularProgress,
  Card,
  CardContent
} from '@mui/material';
import {
  Send as SendIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { useSelector } from 'react-redux';
import api from '../../services/api';

const TestAlerts = () => {
  const { user } = useSelector((state) => state.auth);
  const agencyId = user?.Agency_ID || 17;

  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);

  const [formData, setFormData] = useState({
    alertType: 'PROXIMITY',
    alertLevel: 'warning',
    userId: '',
    targetUserId: '',
    distance: 0.5,
    message: '',
    includeEmail: true,
    includePush: true
  });

  const handleSendTest = async () => {
    if (!formData.userId) {
      setError('User ID is required');
      return;
    }

    setSending(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await api.post(`/alerts/${agencyId}/test`, {
        alertType: formData.alertType,
        alertLevel: formData.alertLevel,
        userId: parseInt(formData.userId),
        targetUserId: formData.targetUserId ? parseInt(formData.targetUserId) : null,
        distance: parseFloat(formData.distance),
        message: formData.message || `Test ${formData.alertType} alert`,
        includeEmail: formData.includeEmail,
        includePush: formData.includePush
      });

      if (response.data.success) {
        setSuccess('Test alert sent successfully! Check the Alert History tab to see the result.');
        setTimeout(() => setSuccess(null), 5000);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send test alert');
    } finally {
      setSending(false);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        Test Alert Delivery
      </Typography>
      <Typography variant="body2" color="textSecondary" gutterBottom>
        Send test alerts to verify alert delivery system
      </Typography>

      <Alert severity="info" sx={{ my: 3 }} icon={<InfoIcon />}>
        <Typography variant="body2">
          <strong>Important:</strong> Test alerts will be sent to real users and appear in alert history. 
          Use this feature carefully to avoid confusion.
        </Typography>
      </Alert>

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

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Alert Configuration
            </Typography>
            <Divider sx={{ mb: 3 }} />

            <Grid container spacing={2}>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Alert Type</InputLabel>
                  <Select
                    value={formData.alertType}
                    label="Alert Type"
                    onChange={(e) => setFormData({ ...formData, alertType: e.target.value })}
                  >
                    <MenuItem value="PROXIMITY">Proximity Alert</MenuItem>
                    <MenuItem value="BOUNDARY">Boundary Violation</MenuItem>
                    <MenuItem value="OVERLAP">Authority Overlap</MenuItem>
                    <MenuItem value="TIME">Time-Based Alert</MenuItem>
                    <MenuItem value="SPEED">Speed Alert</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Alert Level</InputLabel>
                  <Select
                    value={formData.alertLevel}
                    label="Alert Level"
                    onChange={(e) => setFormData({ ...formData, alertLevel: e.target.value })}
                  >
                    <MenuItem value="informational">Informational</MenuItem>
                    <MenuItem value="warning">Warning</MenuItem>
                    <MenuItem value="critical">Critical</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="User ID (Recipient)"
                  type="number"
                  value={formData.userId}
                  onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
                  required
                  helperText="ID of user to receive alert"
                />
              </Grid>

              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Target User ID"
                  type="number"
                  value={formData.targetUserId}
                  onChange={(e) => setFormData({ ...formData, targetUserId: e.target.value })}
                  helperText="For proximity/overlap alerts"
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Distance (Miles)"
                  type="number"
                  value={formData.distance}
                  onChange={(e) => setFormData({ ...formData, distance: e.target.value })}
                  inputProps={{ step: 0.25, min: 0 }}
                  helperText="Triggered distance (0.25, 0.5, 0.75, 1.0)"
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  label="Custom Message (Optional)"
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  placeholder="Leave empty for default message"
                />
              </Grid>

              <Grid item xs={6}>
                <FormControl fullWidth>
                  <InputLabel>Include Email</InputLabel>
                  <Select
                    value={formData.includeEmail}
                    label="Include Email"
                    onChange={(e) => setFormData({ ...formData, includeEmail: e.target.value })}
                  >
                    <MenuItem value={true}>Yes</MenuItem>
                    <MenuItem value={false}>No</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={6}>
                <FormControl fullWidth>
                  <InputLabel>Include Push Notification</InputLabel>
                  <Select
                    value={formData.includePush}
                    label="Include Push Notification"
                    onChange={(e) => setFormData({ ...formData, includePush: e.target.value })}
                  >
                    <MenuItem value={true}>Yes</MenuItem>
                    <MenuItem value={false}>No</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12}>
                <Button
                  fullWidth
                  variant="contained"
                  size="large"
                  startIcon={sending ? <CircularProgress size={20} /> : <SendIcon />}
                  onClick={handleSendTest}
                  disabled={sending || !formData.userId}
                >
                  {sending ? 'Sending Test Alert...' : 'Send Test Alert'}
                </Button>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card sx={{ bgcolor: '#1E1E1E', border: '2px solid', borderColor: formData.alertLevel === 'critical' ? '#f44336' : formData.alertLevel === 'warning' ? '#ff9800' : '#2196f3' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Alert Preview
              </Typography>
              <Divider sx={{ mb: 2 }} />

              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" color="textSecondary">
                  Alert Type:
                </Typography>
                <Typography variant="body1" fontWeight="bold">
                  {formData.alertType}
                </Typography>
              </Box>

              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" color="textSecondary">
                  Alert Level:
                </Typography>
                <Typography 
                  variant="body1" 
                  fontWeight="bold"
                  color={
                    formData.alertLevel === 'critical' ? 'error.main' :
                    formData.alertLevel === 'warning' ? 'warning.main' : 'info.main'
                  }
                >
                  {formData.alertLevel.toUpperCase()}
                </Typography>
              </Box>

              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" color="textSecondary">
                  Distance:
                </Typography>
                <Typography variant="body1">
                  {formData.distance} miles
                </Typography>
              </Box>

              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" color="textSecondary">
                  Message:
                </Typography>
                <Typography variant="body1">
                  {formData.message || `Test ${formData.alertType} alert at ${formData.distance} miles`}
                </Typography>
              </Box>

              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" color="textSecondary">
                  Delivery Methods:
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                  <Button
                    size="small"
                    variant={formData.includeEmail ? 'contained' : 'outlined'}
                    onClick={() => setFormData((prev) => ({ ...prev, includeEmail: !prev.includeEmail }))}
                    sx={{
                      minWidth: 0,
                      px: 1.5,
                      bgcolor: formData.includeEmail ? '#FFD100' : 'transparent',
                      color: formData.includeEmail ? '#000' : '#FFD100',
                      borderColor: '#FFD100',
                      '&:hover': {
                        bgcolor: formData.includeEmail ? '#E6BC00' : 'rgba(255, 209, 0, 0.12)',
                        borderColor: '#FFD100'
                      }
                    }}
                  >
                    Email
                  </Button>
                  <Button
                    size="small"
                    variant={formData.includePush ? 'contained' : 'outlined'}
                    onClick={() => setFormData((prev) => ({ ...prev, includePush: !prev.includePush }))}
                    sx={{
                      minWidth: 0,
                      px: 1.5,
                      bgcolor: formData.includePush ? '#FFD100' : 'transparent',
                      color: formData.includePush ? '#000' : '#FFD100',
                      borderColor: '#FFD100',
                      '&:hover': {
                        bgcolor: formData.includePush ? '#E6BC00' : 'rgba(255, 209, 0, 0.12)',
                        borderColor: '#FFD100'
                      }
                    }}
                  >
                    Push Notification
                  </Button>
                </Box>
              </Box>
            </CardContent>
          </Card>

          <Alert severity="warning" sx={{ mt: 3 }}>
            <Typography variant="body2">
              This will send a real alert to User ID {formData.userId || '[Not Set]'}. 
              The alert will appear in the mobile app and email (if enabled).
            </Typography>
          </Alert>
        </Grid>
      </Grid>
    </Box>
  );
};

export default TestAlerts;
