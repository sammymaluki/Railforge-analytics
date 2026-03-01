import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
} from '@mui/material';
import {
  Add as AddIcon,
  Refresh as RefreshIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import api from '../../services/api';

const UserList = () => {
  const [users, setUsers] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    employeeName: '',
    employeeContact: '',
    email: '',
    role: 'Field_Worker',
    agencyId: '',
  });
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    loadUsers();
    loadAgencies();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/users');
      if (response.data.success) {
        const userData = response.data.data.users || response.data.data || [];
        setUsers(Array.isArray(userData) ? userData : []);
      } else {
        setUsers([]);
      }
    } catch (err) {
      setError('Failed to load users');
      setUsers([]);
      console.error('Error loading users:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAgencies = async () => {
    try {
      const response = await api.get('/agencies');
      if (response.data.success) {
        const agencyData = response.data.data.agencies || response.data.data || [];
        setAgencies(Array.isArray(agencyData) ? agencyData : []);
      }
    } catch (err) {
      console.error('Error loading agencies:', err);
    }
  };

  const handleOpenDialog = () => {
    setEditingUser(null);
    setError(null);
    setFormData({
      username: '',
      password: '',
      employeeName: '',
      employeeContact: '',
      email: '',
      role: 'Field_Worker',
      agencyId: '',
    });
    setFormErrors({});
    setOpenDialog(true);
  };

  const handleEditUser = (user) => {
    setEditingUser(user);
    setFormData({
      username: user.Username,
      password: '', // Don't populate password for security
      employeeName: user.Employee_Name,
      employeeContact: user.Employee_Contact || '',
      email: user.Email || '',
      role: user.Role,
      agencyId: user.Agency_ID,
    });
    setFormErrors({});
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setError(null);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
    if (formErrors[name]) {
      setFormErrors({ ...formErrors, [name]: '' });
    }
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.username.trim()) {
      errors.username = 'Username is required';
    } else if (!editingUser) {
      const exists = users.some(
        (u) => String(u?.Username || '').toLowerCase() === String(formData.username || '').trim().toLowerCase()
      );
      if (exists) {
        errors.username = 'Username already exists';
      }
    }
    // Password only required for new users
    if (!editingUser && !formData.password.trim()) {
      errors.password = 'Password is required';
    } else if (formData.password && formData.password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }
    if (!formData.employeeName.trim()) {
      errors.employeeName = 'Employee name is required';
    }
    if (!formData.agencyId) {
      errors.agencyId = 'Agency is required';
    }
    if (formData.email && !/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = 'Invalid email format';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveUser = async () => {
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      let response;
      const payload = { ...formData };
      
      // Remove password from payload if editing and password is empty
      if (editingUser && !formData.password) {
        delete payload.password;
      }
      
      if (editingUser) {
        response = await api.put(`/users/${editingUser.User_ID}`, payload);
      } else {
        response = await api.post('/users', payload);
      }
      
      if (response.data.success) {
        setOpenDialog(false);
        loadUsers();
      }
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || `Failed to ${editingUser ? 'update' : 'create'} user`);
      console.error(`Error ${editingUser ? 'updating' : 'creating'} user:`, err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await api.delete(`/users/${userId}`);
      if (response.data.success) {
        loadUsers();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete user');
      console.error('Error deleting user:', err);
    } finally {
      setLoading(false);
    }
  };

  const getRoleColor = (role) => {
    const colors = {
      Administrator: 'error',
      Supervisor: 'warning',
      Field_Worker: 'info',
      Viewer: 'default',
    };
    return colors[role] || 'default';
  };

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h5" component="h1">
              Users Management
            </Typography>
            <Box>
              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={loadUsers}
                sx={{ mr: 2 }}
                disabled={loading}
              >
                Refresh
              </Button>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleOpenDialog}
                disabled={loading}
              >
                New User
              </Button>
            </Box>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          )}

          {!loading && users.length === 0 && (
            <Typography variant="body1" sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
              No users found
            </Typography>
          )}

          {!loading && users.length > 0 && (
            <TableContainer component={Paper} variant="outlined">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Username</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Contact</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell>Agency</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.User_ID}>
                      <TableCell>{user.Username}</TableCell>
                      <TableCell>{user.Employee_Name}</TableCell>
                      <TableCell>{user.Email || '-'}</TableCell>
                      <TableCell>{user.Employee_Contact || '-'}</TableCell>
                      <TableCell>
                        <Chip
                          label={user.Role}
                          color={getRoleColor(user.Role)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{user.Agency_Name || user.Agency_CD || '-'}</TableCell>
                      <TableCell>
                        <Chip
                          label={user.Is_Active ? 'Active' : 'Inactive'}
                          color={user.Is_Active ? 'success' : 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          startIcon={<EditIcon />}
                          sx={{ mr: 1 }}
                          onClick={() => handleEditUser(user)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          startIcon={<DeleteIcon />}
                          onClick={() => handleDeleteUser(user.User_ID)}
                        >
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit User Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>{editingUser ? 'Edit User' : 'Create New User'}</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Grid container spacing={3} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Username *"
                name="username"
                value={formData.username}
                onChange={handleInputChange}
                error={!!formErrors.username}
                helperText={formErrors.username || 'Unique login identifier'}
                required
                disabled={editingUser} // Disable username editing
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Password"
                name="password"
                type="password"
                value={formData.password}
                onChange={handleInputChange}
                error={!!formErrors.password}
                helperText={formErrors.password || (editingUser ? 'Leave blank to keep current password' : '')}
                required={!editingUser}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Employee Name *"
                name="employeeName"
                value={formData.employeeName}
                onChange={handleInputChange}
                error={!!formErrors.employeeName}
                helperText={formErrors.employeeName || 'Full name of the employee'}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Contact Phone"
                name="employeeContact"
                value={formData.employeeContact}
                onChange={handleInputChange}
                helperText="Employee phone number'"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                helperText="User email address"
                error={!!formErrors.email}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Role *</InputLabel>
                <Select
                  value={formData.role}
                  label="Role"
                  name="role"
                  onChange={handleInputChange}
                  sx={{ height: 56, minWidth: 220 }}
                >
                  <MenuItem value="Administrator">Administrator</MenuItem>
                  <MenuItem value="Supervisor">Supervisor</MenuItem>
                  <MenuItem value="Field_Worker">Field Worker</MenuItem>
                  <MenuItem value="Viewer">Viewer</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth error={!!formErrors.agencyId} sx={{ minWidth: 240 }}>
                <InputLabel>Agency *</InputLabel>
                <Select
                  value={formData.agencyId}
                  label="Agency"
                  name="agencyId"
                  onChange={handleInputChange}
                  sx={{ height: 56, minWidth: 240 }}
                >
                  {agencies.map((agency) => (
                    <MenuItem key={agency.Agency_ID} value={agency.Agency_ID}>
                      {agency.Agency_Name} ({agency.Agency_CD})
                    </MenuItem>
                  ))}
                </Select>
                <Typography variant="caption" color={formErrors.agencyId ? 'error' : 'text.secondary'} sx={{ mt: 0.75, ml: 1.5 }}>
                  {formErrors.agencyId || 'Select the agency this user belongs to'}
                </Typography>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleSaveUser} variant="contained" disabled={loading}>
            {loading ? (editingUser ? 'Updating...' : 'Creating...') : (editingUser ? 'Update User' : 'Create User')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default UserList;
