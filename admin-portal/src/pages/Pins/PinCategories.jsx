import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
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
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Card,
  CardContent
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { useSelector } from 'react-redux';
import api from '../../services/api';

const PinCategories = () => {
  const { user } = useSelector((state) => state.auth);
  // Use the logged-in user's agency ID
  const agencyId = user?.Agency_ID || user?.agencyId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [pinTypes, setPinTypes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPin, setEditingPin] = useState(null);

  const [formData, setFormData] = useState({
    category: '',
    subtype: '',
    color: '#FF0000',
    iconUrl: '',
    isActive: true,
    sortOrder: 1
  });

  const loadPinTypes = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get(`/config/agencies/${agencyId}/pin-types`);
      
      if (response.data.success) {
        setPinTypes(response.data.data.pinTypes || []);
        
        // Extract unique categories with counts
        const categoryMap = {};
        (response.data.data.pinTypes || []).forEach(pin => {
          if (!categoryMap[pin.Pin_Category]) {
            categoryMap[pin.Pin_Category] = {
              name: pin.Pin_Category,
              count: 0,
              active: 0
            };
          }
          categoryMap[pin.Pin_Category].count++;
          if (pin.Is_Active) {
            categoryMap[pin.Pin_Category].active++;
          }
        });
        setCategories(Object.values(categoryMap));
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load pin types');
    } finally {
      setLoading(false);
    }
  }, [agencyId]);

  useEffect(() => {
    loadPinTypes();
  }, [loadPinTypes]);

  const handleOpenDialog = (pin = null) => {
    if (pin) {
      setEditingPin(pin);
      setFormData({
        category: pin.Pin_Category,
        subtype: pin.Pin_Subtype,
        color: pin.Color,
        iconUrl: pin.Icon_URL || '',
        isActive: pin.Is_Active,
        sortOrder: pin.Sort_Order
      });
    } else {
      setEditingPin(null);
      setFormData({
        category: '',
        subtype: '',
        color: '#FF0000',
        iconUrl: '',
        isActive: true,
        sortOrder: pinTypes.length + 1
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingPin(null);
  };

  const handleSave = async () => {
    if (!formData.category || !formData.subtype) {
      setError('Category and Subtype are required');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      let response;
      const payload = {
        pinCategory: formData.category,
        pinSubtype: formData.subtype,
        color: formData.color,
        iconUrl: formData.iconUrl || null,
        isActive: formData.isActive,
        sortOrder: formData.sortOrder
      };

      if (editingPin) {
        response = await api.put(
          `/config/agencies/${agencyId}/pin-types/${editingPin.Pin_Type_ID}`,
          payload
        );
      } else {
        response = await api.post(`/config/agencies/${agencyId}/pin-types`, payload);
      }

      if (response.data.success) {
        setSuccess(
          editingPin 
            ? 'Pin type updated successfully!'
            : 'Pin type created successfully!'
        );
        handleCloseDialog();
        loadPinTypes();
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save pin type');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (pinTypeId) => {
    if (!window.confirm('Are you sure you want to delete this pin type?')) {
      return;
    }

    try {
      const response = await api.delete(`/config/agencies/${agencyId}/pin-types/${pinTypeId}`);
      if (response.data.success) {
        setSuccess('Pin type deleted successfully!');
        loadPinTypes();
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete pin type');
    }
  };

  const handleFormChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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
          <Typography variant="h4" gutterBottom>
            Pin Categories
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Manage pin drop categories and configurations for field workers
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

      {/* Category Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {categories.map((category) => (
          <Grid item xs={12} sm={6} md={3} key={category.name}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  {category.name}
                </Typography>
                <Typography variant="h4">
                  {category.active}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  {category.count} total types
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Pin Types Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell><strong>Category</strong></TableCell>
              <TableCell><strong>Subtype</strong></TableCell>
              <TableCell><strong>Color</strong></TableCell>
              <TableCell><strong>Sort Order</strong></TableCell>
              <TableCell><strong>Status</strong></TableCell>
              <TableCell><strong>Actions</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pinTypes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  <Typography color="textSecondary">
                    No pin types found. Click "Add Pin Type" to create one.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              pinTypes.map((pin) => (
                <TableRow key={pin.Pin_Type_ID}>
                  <TableCell>{pin.Pin_Category}</TableCell>
                  <TableCell>{pin.Pin_Subtype}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        sx={{
                          width: 24,
                          height: 24,
                          backgroundColor: pin.Color,
                          border: '1px solid #ccc',
                          borderRadius: 1
                        }}
                      />
                      <Typography variant="body2">{pin.Color}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell>{pin.Sort_Order}</TableCell>
                  <TableCell>
                    <Chip
                      label={pin.Is_Active ? 'Active' : 'Inactive'}
                      color={pin.Is_Active ? 'success' : 'default'}
                      size="small"
                      variant={pin.Is_Active ? 'filled' : 'outlined'}
                    />
                  </TableCell>
                  <TableCell>
                    <Tooltip title="Edit">
                      <IconButton
                        size="small"
                        onClick={() => handleOpenDialog(pin)}
                        color="primary"
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        onClick={() => handleDelete(pin.Pin_Type_ID)}
                        color="error"
                      >
                        <DeleteIcon fontSize="small" />
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
          {editingPin ? 'Edit Pin Type' : 'Add New Pin Type'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              fullWidth
              label="Category"
              value={formData.category}
              onChange={(e) => handleFormChange('category', e.target.value)}
              placeholder="e.g., Safety, Infrastructure, Maintenance"
            />
            
            <TextField
              fullWidth
              label="Subtype"
              value={formData.subtype}
              onChange={(e) => handleFormChange('subtype', e.target.value)}
              placeholder="e.g., Hazard, Track Damage, Note"
            />

            <Box>
              <Typography variant="body2" color="textSecondary" gutterBottom>
                Color
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <input
                  type="color"
                  value={formData.color}
                  onChange={(e) => handleFormChange('color', e.target.value)}
                  style={{ width: 60, height: 40, border: '1px solid #ccc', cursor: 'pointer' }}
                />
                <TextField
                  size="small"
                  value={formData.color}
                  onChange={(e) => handleFormChange('color', e.target.value)}
                  placeholder="#FF0000"
                  sx={{ flexGrow: 1 }}
                />
              </Box>
            </Box>

            <TextField
              fullWidth
              label="Icon URL (Optional)"
              value={formData.iconUrl}
              onChange={(e) => handleFormChange('iconUrl', e.target.value)}
              placeholder="https://example.com/icon.png"
            />

            <TextField
              fullWidth
              type="number"
              label="Sort Order"
              value={formData.sortOrder}
              onChange={(e) => handleFormChange('sortOrder', parseInt(e.target.value))}
              inputProps={{ min: 1 }}
            />

            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                value={formData.isActive}
                onChange={(e) => handleFormChange('isActive', e.target.value)}
                label="Status"
              >
                <MenuItem value={true}>Active</MenuItem>
                <MenuItem value={false}>Inactive</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={saving}
          >
            {saving ? <CircularProgress size={24} /> : (editingPin ? 'Update' : 'Create')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PinCategories;
