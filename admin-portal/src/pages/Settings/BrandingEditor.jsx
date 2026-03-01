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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Avatar,
  Card,
  CardContent,
  Divider
} from '@mui/material';
import {
  Save as SaveIcon,
  Refresh as RefreshIcon,
  Info as InfoIcon,
  Palette as PaletteIcon
} from '@mui/icons-material';
import { useSelector } from 'react-redux';
import api from '../../services/api';

const BrandingEditor = () => {
  const { user } = useSelector((state) => state.auth);
  // Use the logged-in user's agency ID
  const agencyId = user?.Agency_ID || user?.agencyId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [formData, setFormData] = useState({
    agencyName: '',
    logoUrl: '',
    primaryColor: '#FFD100',
    secondaryColor: '#000000',
    accentColor: '#FFFFFF',
    theme: 'dark',
    backgroundColor: '#121212',
    paperBackground: '#1E1E1E',
    fontFamily: 'Roboto',
    customCss: ''
  });

  useEffect(() => {
    loadBranding();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agencyId]);

  const loadBranding = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get(`/branding/agency/${agencyId}`);
      if (response.data.success) {
        const branding = response.data.data;
        setFormData({
          agencyName: branding.Agency_Name || '',
          logoUrl: branding.Logo_URL || '',
          primaryColor: branding.Primary_Color || '#FFD100',
          secondaryColor: branding.Secondary_Color || '#000000',
          accentColor: branding.Accent_Color || '#FFFFFF',
          theme: branding.Theme || 'dark',
          backgroundColor: branding.Background_Color || '#121212',
          paperBackground: branding.Paper_Background || '#1E1E1E',
          fontFamily: branding.Font_Family || 'Roboto',
          customCss: branding.Custom_CSS || ''
        });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load branding');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await api.put(`/branding/agency/${agencyId}`, {
        agencyName: formData.agencyName,
        logoUrl: formData.logoUrl,
        primaryColor: formData.primaryColor,
        secondaryColor: formData.secondaryColor,
        accentColor: formData.accentColor,
        theme: formData.theme,
        backgroundColor: formData.backgroundColor,
        paperBackground: formData.paperBackground,
        fontFamily: formData.fontFamily,
        customCss: formData.customCss
      });

      if (response.data.success) {
        setSuccess('Branding settings saved successfully! Client will be notified via email. Please refresh the page to see changes.');
        setTimeout(() => setSuccess(null), 5000);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save branding');
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
            Branding & Theme Editor
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Customize agency branding with white/black/yellow theme
          </Typography>
        </Box>
        <Box>
          <Tooltip title="Reload">
            <IconButton onClick={loadBranding} disabled={loading}>
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
          <strong>Client Requirement:</strong> Standard theme is White/Black/Yellow (#FFD100). 
          All branding changes require client approval and will trigger email notification to Ryan Medlin.
        </Typography>
      </Alert>

      <Grid container spacing={3}>
        {/* Agency Info */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <PaletteIcon /> Agency Information
            </Typography>
            <Divider sx={{ mb: 2 }} />

            <TextField
              fullWidth
              label="Agency Name"
              value={formData.agencyName}
              onChange={(e) => setFormData({ ...formData, agencyName: e.target.value })}
              sx={{ mb: 2 }}
            />

            <TextField
              fullWidth
              label="Logo URL"
              value={formData.logoUrl}
              onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
              helperText="URL to agency logo image"
              sx={{ mb: 2 }}
            />

            {formData.logoUrl && (
              <Box sx={{ mt: 2, textAlign: 'center' }}>
                <Typography variant="caption" display="block" gutterBottom>
                  Logo Preview:
                </Typography>
                <Avatar
                  src={formData.logoUrl}
                  alt="Agency Logo"
                  sx={{ width: 120, height: 120, margin: '0 auto' }}
                  variant="rounded"
                />
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Color Scheme */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Color Scheme
            </Typography>
            <Divider sx={{ mb: 2 }} />

            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Primary Color"
                  type="color"
                  value={formData.primaryColor}
                  onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  helperText="Default: #FFD100 (Yellow)"
                />
              </Grid>

              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Secondary Color"
                  type="color"
                  value={formData.secondaryColor}
                  onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  helperText="Default: #000000 (Black)"
                />
              </Grid>

              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Accent Color"
                  type="color"
                  value={formData.accentColor}
                  onChange={(e) => setFormData({ ...formData, accentColor: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  helperText="Default: #FFFFFF (White)"
                />
              </Grid>

              <Grid item xs={6}>
                <FormControl fullWidth>
                  <InputLabel>Theme</InputLabel>
                  <Select
                    value={formData.theme}
                    label="Theme"
                    onChange={(e) => setFormData({ ...formData, theme: e.target.value })}
                    sx={{ height: 56 }}
                  >
                    <MenuItem value="dark">Dark Theme</MenuItem>
                    <MenuItem value="light">Light Theme</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Background Color"
                  type="color"
                  value={formData.backgroundColor}
                  onChange={(e) => setFormData({ ...formData, backgroundColor: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  helperText="Main app background color"
                  sx={{
                    minWidth: 220,
                    '& .MuiInputBase-root': { minHeight: 56 },
                    '& input': { minHeight: 36, cursor: 'pointer' },
                  }}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Paper Background"
                  type="color"
                  value={formData.paperBackground}
                  onChange={(e) => setFormData({ ...formData, paperBackground: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  helperText="Card/panel background color"
                  sx={{
                    minWidth: 220,
                    '& .MuiInputBase-root': { minHeight: 56 },
                    '& input': { minHeight: 36, cursor: 'pointer' },
                  }}
                />
              </Grid>
            </Grid>

            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" display="block" gutterBottom>
                Color Preview:
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                <Box sx={{ 
                  width: 60, 
                  height: 60, 
                  bgcolor: formData.primaryColor, 
                  borderRadius: 1,
                  border: '1px solid #ccc'
                }} />
                <Box sx={{ 
                  width: 60, 
                  height: 60, 
                  bgcolor: formData.secondaryColor, 
                  borderRadius: 1,
                  border: '1px solid #ccc'
                }} />
                <Box sx={{ 
                  width: 60, 
                  height: 60, 
                  bgcolor: formData.accentColor, 
                  borderRadius: 1,
                  border: '1px solid #ccc'
                }} />
              </Box>
            </Box>
          </Paper>
        </Grid>

        {/* Typography */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Typography
            </Typography>
            <Divider sx={{ mb: 2 }} />

            <FormControl fullWidth>
              <InputLabel>Font Family</InputLabel>
              <Select
                value={formData.fontFamily}
                label="Font Family"
                onChange={(e) => setFormData({ ...formData, fontFamily: e.target.value })}
                sx={{ height: 56 }}
              >
                <MenuItem value="Roboto">Roboto</MenuItem>
                <MenuItem value="Arial">Arial</MenuItem>
                <MenuItem value="Helvetica">Helvetica</MenuItem>
                <MenuItem value="Times New Roman">Times New Roman</MenuItem>
                <MenuItem value="Courier New">Courier New</MenuItem>
              </Select>
            </FormControl>
          </Paper>
        </Grid>

        {/* Custom CSS */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Custom CSS (Advanced)
            </Typography>
            <Divider sx={{ mb: 2 }} />

            <TextField
              fullWidth
              multiline
              rows={8}
              label="Custom CSS"
              value={formData.customCss}
              onChange={(e) => setFormData({ ...formData, customCss: e.target.value })}
              placeholder=".custom-class { color: #FFD100; }"
              helperText="Advanced: Add custom CSS rules for additional styling"
            />
          </Paper>
        </Grid>

        {/* Preview Card */}
        <Grid item xs={12}>
          <Card sx={{ 
            bgcolor: formData.backgroundColor,
            border: '2px solid',
            borderColor: formData.primaryColor
          }}>
            <CardContent>
              <Typography variant="h6" sx={{ color: formData.primaryColor }}>
                Preview: {formData.agencyName || 'Agency Name'}
              </Typography>
              <Typography variant="body2" sx={{ color: formData.accentColor, mt: 1 }}>
                This is how your branding will appear in the application.
              </Typography>
              <Button 
                variant="contained" 
                sx={{ 
                  mt: 2, 
                  bgcolor: formData.primaryColor,
                  color: formData.secondaryColor,
                  '&:hover': {
                    bgcolor: formData.primaryColor,
                    opacity: 0.9
                  }
                }}
              >
                Sample Button
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box sx={{ textAlign: 'center', mt: 4 }}>
        <Button
          variant="contained"
          size="large"
          startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
          onClick={handleSave}
          disabled={saving}
        >
          Save All Branding Changes
        </Button>
      </Box>
    </Box>
  );
};

export default BrandingEditor;
