import React, { useEffect, useState } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  Alert,
  MenuItem,
  CircularProgress,
  Link
} from '@mui/material';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { register } from '../../store/slices/authSlice';
import api from '../../services/api';

const Register = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    employeeName: '',
    employeeContact: '',
    email: '',
    role: 'Field_Worker',
    agencyId: ''
  });
  const [agencies, setAgencies] = useState([]);
  const [roles, setRoles] = useState(['Field_Worker', 'Supervisor', 'Viewer']);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const response = await api.get('/auth/register/options');
        if (response.data.success) {
          setAgencies(response.data.data.agencies || []);
          setRoles(response.data.data.roles || ['Field_Worker', 'Supervisor', 'Viewer']);
        }
      } catch (err) {
        setError('Failed to load registration options');
      } finally {
        setLoadingOptions(false);
      }
    };

    loadOptions();
  }, []);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        username: formData.username.trim(),
        password: formData.password,
        employeeName: formData.employeeName.trim(),
        employeeContact: formData.employeeContact.trim(),
        email: formData.email.trim(),
        role: formData.role,
        agencyId: Number(formData.agencyId)
      };

      await dispatch(register(payload)).unwrap();
      navigate('/');
    } catch (err) {
      setError(err || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  if (loadingOptions) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" fontWeight="bold" gutterBottom textAlign="center">
        Create Account
      </Typography>
      <Typography variant="body2" color="textSecondary" textAlign="center" mb={3}>
        Admin Portal Registration
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <form onSubmit={handleSubmit}>
        <TextField fullWidth label="Full Name" name="employeeName" value={formData.employeeName} onChange={handleChange} required margin="normal" />
        <TextField fullWidth label="Phone" name="employeeContact" value={formData.employeeContact} onChange={handleChange} margin="normal" />
        <TextField fullWidth label="Email" name="email" type="email" value={formData.email} onChange={handleChange} margin="normal" />
        <TextField fullWidth label="Username" name="username" value={formData.username} onChange={handleChange} required margin="normal" />
        <TextField fullWidth label="Password" name="password" type="password" value={formData.password} onChange={handleChange} required margin="normal" />
        <TextField fullWidth label="Confirm Password" name="confirmPassword" type="password" value={formData.confirmPassword} onChange={handleChange} required margin="normal" />
        <TextField
          fullWidth
          select
          label="Agency"
          name="agencyId"
          value={formData.agencyId}
          onChange={handleChange}
          required
          margin="normal"
        >
          {agencies.map((agency) => (
            <MenuItem key={agency.Agency_ID} value={agency.Agency_ID}>
              {agency.Agency_Name} ({agency.Agency_CD})
            </MenuItem>
          ))}
        </TextField>
        <TextField
          fullWidth
          select
          label="Role"
          name="role"
          value={formData.role}
          onChange={handleChange}
          required
          margin="normal"
        >
          {roles.map((role) => (
            <MenuItem key={role} value={role}>
              {role}
            </MenuItem>
          ))}
        </TextField>

        <Button
          type="submit"
          fullWidth
          variant="contained"
          size="large"
          disabled={loading}
          sx={{ mt: 2, bgcolor: '#FFD100', color: '#000', fontWeight: 'bold' }}
        >
          {loading ? 'Creating...' : 'Create Account'}
        </Button>
      </form>

      <Box sx={{ mt: 2, textAlign: 'center' }}>
        <Link component={RouterLink} to="/login" underline="hover">
          Already have an account? Sign In
        </Link>
      </Box>
    </Box>
  );
};

export default Register;
