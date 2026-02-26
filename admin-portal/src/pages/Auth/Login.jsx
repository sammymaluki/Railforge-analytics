import React, { useState } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  Alert,
  InputAdornment,
  IconButton,
  CircularProgress
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  Login as LoginIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { login } from '../../store/slices/authSlice';

const Login = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

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
    setLoading(true);

    try {
      // Dispatch login action
      await dispatch(login(formData)).unwrap();
      
      // If we get here, login succeeded
      navigate('/');
    } catch (err) {
      setError(err || 'Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" fontWeight="bold" gutterBottom textAlign="center">
        Admin Portal
      </Typography>
      <Typography variant="body2" color="textSecondary" textAlign="center" mb={3}>
        Sidekick Management System
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <form onSubmit={handleSubmit}>
        <TextField
          fullWidth
          label="Username"
          name="username"
          type="text"
          value={formData.username}
          onChange={handleChange}
          required
          autoFocus
          margin="normal"
          sx={{ mb: 2 }}
          placeholder="admin"
        />

        <TextField
          fullWidth
          label="Password"
          name="password"
          type={showPassword ? 'text' : 'password'}
          value={formData.password}
          onChange={handleChange}
          required
          margin="normal"
          sx={{ mb: 3 }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  onClick={() => setShowPassword(!showPassword)}
                  edge="end"
                >
                  {showPassword ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />

        <Button
          type="submit"
          fullWidth
          variant="contained"
          size="large"
          disabled={loading}
          startIcon={loading ? <CircularProgress size={20} /> : <LoginIcon />}
          sx={{
            bgcolor: '#FFD100',
            color: '#000',
            fontWeight: 'bold',
            py: 1.5,
            '&:hover': {
              bgcolor: '#E6BC00',
            },
            '&:disabled': {
              bgcolor: 'rgba(255, 209, 0, 0.5)',
            }
          }}
        >
          {loading ? 'Signing In...' : 'Sign In'}
        </Button>
      </form>

      <Box sx={{ mt: 3, textAlign: 'center' }}>
        <Typography variant="caption" color="textSecondary">
          Administrator access only
        </Typography>
      </Box>
    </Box>
  );
};

export default Login;
