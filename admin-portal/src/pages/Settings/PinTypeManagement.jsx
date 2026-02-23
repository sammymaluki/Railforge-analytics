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
  Avatar,
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
  Info as InfoIcon,
  Circle as CircleIcon
} from '@mui/icons-material';
import { useSelector } from 'react-redux';
import api from '../../services/api';

const PinTypeManagement = () => {
  const { user } = useSelector((state) => state.auth);
  // Use DEFAULT agency (ID 1) for testing
  const agencyId = 1;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [pinTypes, setPinTypes] = useState({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPin, setEditingPin] = useState(null);

  const [formData, setFormData] = useState({
    category: '',
    subtype: '',
    color: '#FFD100',
    iconUrl: '',
    sortOrder: 0
  });

  const defaultCategories = [
    'Track Obstruction',
    'Equipment Issue',
    'Safety Hazard',
    'Maintenance Needed',
    'Signal Problem',
    'Switch Issue',
    'Infrastructure',
    'Other'
  ];

  useEffect(() => {
    loadPinTypes();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agencyId]);

  const loadPinTypes = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get(`/config/agencies/${agencyId}/pin-types`);
      if (response.data.success) {
        const pinTypesArray = response.data.data.pinTypes || [];
        
        // Transform array into grouped object by category
        const groupedPinTypes = {};
        if (Array.isArray(pinTypesArray)) {
          pinTypesArray.forEach((pin) => {
            const category = pin.category || pin.Pin_Category || 'Other';
            if (!groupedPinTypes[category]) {
              groupedPinTypes[category] = [];
            }
            groupedPinTypes[category].push({
              pinTypeId: pin.pinTypeId || pin.Pin_Type_ID,
              category: category,
              subtype: pin.subtype || pin.Pin_Subtype,
              color: pin.color || pin.Color,
              iconUrl: pin.iconUrl || pin.Icon_URL,
              sortOrder: pin.sortOrder || pin.Sort_Order || 0,
              isActive: pin.isActive !== undefined ? pin.isActive : true
            });
          });
        }
        
        setPinTypes(groupedPinTypes);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load pin types');
      setPinTypes({}); // Ensure pinTypes is always an object
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (pin = null) => {
    if (pin) {
      setEditingPin(pin);
      setFormData({
        category: pin.category,
        subtype: pin.subtype,
        color: pin.color,
        iconUrl: pin.iconUrl || '',
        sortOrder: pin.sortOrder || 0
      });
    } else {
      setEditingPin(null);
      setFormData({
        category: '',
        subtype: '',
        color: '#FFD100',
        iconUrl: '',
        sortOrder: 0
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingPin(null);
  };

  const handleSave = async () => {
    if (!formData.category || !formData.subtype || !formData.color) {
      setError('Category, subtype, and color are required');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      let response;
      if (editingPin) {
        response = await api.put(
          `/config/pin-types/${agencyId}/${editingPin.pinTypeId}`,
          formData
        );
      } else {
        response = await api.post(`/config/pin-types/${agencyId}`, formData);
      }

      if (response.data.success) {
        setSuccess(
          editingPin 
            ? 'Pin type updated successfully! Client will be notified via email.'
            : 'Pin type created successfully! Client will be notified via email.'
        );
        handleCloseDialog();
        loadPinTypes();
        setTimeout(() => setSuccess(null), 5000);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save pin type');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (pinTypeId) => {
    if (!window.confirm('Are you sure you want to delete this pin type? All associated pins will be affected.')) {
      return;
    }

    try {
      const response = await api.delete(`/config/pin-types/${agencyId}/${pinTypeId}`);
      if (response.data.success) {
        setSuccess('Pin type deleted successfully!');
        loadPinTypes();
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete pin type');
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
            Pin Type Management
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Configure customizable pin drop categories for field workers
          </Typography>
        </Box>
        <Box>
          <Tooltip title="Reload">
            <IconButton onClick={loadPinTypes} disabled={loading}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
            sx={{ ml: 1 }}
          >
            Add Pin Type
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
          <strong>Customizable Categories:</strong> All pin categories and subtypes can be customized per client requirements. 
          Changes will trigger email notification for approval.
        </Typography>
      </Alert>

      {Object.keys(pinTypes).length === 0 ? (
        <Paper sx={{ p: 5, textAlign: 'center' }}>
          <Typography color="textSecondary">
            No pin types configured. Click "Add Pin Type" to create customizable categories.
          </Typography>
        </Paper>
      ) : (
        Object.entries(pinTypes).map(([category, pins]) => (
          <Paper key={category} sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" gutterBottom sx={{ color: '#FFD100' }}>
              {category}
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell width="60px">Color</TableCell>
                    <TableCell><strong>Subtype</strong></TableCell>
                    <TableCell><strong>Icon URL</strong></TableCell>
                    <TableCell><strong>Sort Order</strong></TableCell>
                    <TableCell><strong>Status</strong></TableCell>
                    <TableCell align="center"><strong>Actions</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pins.map((pin) => (
                    <TableRow key={pin.pinTypeId} hover>
                      <TableCell>
                        <Avatar sx={{ bgcolor: pin.color, width: 32, height: 32 }}>
                          <CircleIcon />
                        </Avatar>
                      </TableCell>
                      <TableCell>{pin.subtype}</TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                          {pin.iconUrl || 'N/A'}
                        </Typography>
                      </TableCell>
                      <TableCell>{pin.sortOrder}</TableCell>
                      <TableCell>
                        <Chip
                          label={pin.isActive ? 'Active' : 'Inactive'}
                          color={pin.isActive ? 'success' : 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Tooltip title="Edit">
                          <IconButton 
                            size="small" 
                            onClick={() => handleOpenDialog(pin)}
                            color="primary"
                          >
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton 
                            size="small" 
                            onClick={() => handleDelete(pin.pinTypeId)}
                            color="error"
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        ))
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingPin ? 'Edit Pin Type' : 'Add Pin Type'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Category</InputLabel>
                <Select
                  value={formData.category}
                  label="Category"
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                >
                  {defaultCategories.map((cat) => (
                    <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Subtype"
                value={formData.subtype}
                onChange={(e) => setFormData({ ...formData, subtype: e.target.value })}
                required
                helperText="Specific pin type name (e.g., 'Broken Rail', 'Derail Down')"
              />
            </Grid>

            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Color"
                type="color"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                required
                InputLabelProps={{ shrink: true }}
              />
            </Grid>

            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Sort Order"
                type="number"
                value={formData.sortOrder}
                onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                inputProps={{ min: 0 }}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Icon URL (Optional)"
                value={formData.iconUrl}
                onChange={(e) => setFormData({ ...formData, iconUrl: e.target.value })}
                helperText="URL to custom icon image"
              />
            </Grid>

            <Grid item xs={12}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2, bgcolor: '#1E1E1E', borderRadius: 1 }}>
                <Typography variant="body2">Preview:</Typography>
                <Avatar sx={{ bgcolor: formData.color, width: 40, height: 40 }}>
                  <CircleIcon />
                </Avatar>
                <Typography variant="body2">
                  {formData.category} - {formData.subtype || 'Subtype'}
                </Typography>
              </Box>
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
            {editingPin ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PinTypeManagement;
