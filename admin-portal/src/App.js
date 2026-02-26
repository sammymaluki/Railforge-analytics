// admin-portal/src/App.js
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box, CircularProgress } from '@mui/material';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { store } from './store/store';

// Layouts
import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';

// Pages
import Login from './pages/Auth/Login';
import Dashboard from './pages/Dashboard';
import Agencies from './pages/Agencies/AgencyList';
import AgencyDetails from './pages/Agencies/AgencyDetails';
import Users from './pages/Users/UserList';
import PinCategories from './pages/Pins/PinCategories';
import Reports from './pages/Reports/Reports';
import DataImport from './pages/DataImport/DataImport';
import AuditLogs from './pages/AuditLogs';

// New Tabbed Pages
import Settings from './pages/Settings';
import Alerts from './pages/Alerts';
import Authorities from './pages/Authorities';

// Services
import { verifyToken } from './store/slices/authSlice';
import { loadBranding } from './store/slices/settingsSlice';
import { isGlobalAdmin, getAgencyId } from './utils/rbac';

// Default theme
const defaultTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#FFD100',
      contrastText: '#000000',
    },
    secondary: {
      main: '#000000',
      contrastText: '#FFFFFF',
    },
    background: {
      default: '#121212',
      paper: '#1E1E1E',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h4: {
      fontWeight: 700,
    },
    h6: {
      fontWeight: 600,
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 600,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
  },
});

const AppContent = () => {
  const dispatch = useDispatch();
  const [loading, setLoading] = useState(true);
  const { isAuthenticated, user } = useSelector((state) => state.auth);
  const { branding } = useSelector((state) => state.settings);

  useEffect(() => {
    const verifyExistingToken = async () => {
      try {
        // Check for existing token
        const token = localStorage.getItem('admin_token');
        if (token) {
          try {
            await dispatch(verifyToken(token)).unwrap();
          } catch (error) {
            // If token verification fails, clear it
            localStorage.removeItem('admin_token');
            console.log('Token expired or invalid');
          }
        }
      } catch (error) {
        console.error('App initialization error:', error);
      } finally {
        setLoading(false);
      }
    };

    verifyExistingToken();
  }, [dispatch]);

  useEffect(() => {
    const agencyId = getAgencyId(user);
    if (isAuthenticated && agencyId) {
      dispatch(loadBranding(agencyId));
    }
  }, [dispatch, isAuthenticated, user]);

  const theme = branding?.primaryColor 
    ? createTheme({
        ...defaultTheme,
        palette: {
          ...defaultTheme.palette,
          primary: {
            main: branding.primaryColor,
            contrastText: branding.secondaryColor || '#000000',
          },
          secondary: {
            main: branding.secondaryColor || '#000000',
            contrastText: branding.accentColor || '#FFFFFF',
          },
        },
      })
    : defaultTheme;

  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
        bgcolor="background.default"
      >
        <CircularProgress size={60} style={{ color: '#FFD100' }} />
      </Box>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<AuthLayout><Login /></AuthLayout>} />
          
          {/* Protected routes */}
          <Route path="/" element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }>
            <Route index element={<Dashboard />} />
            <Route
              path="agencies"
              element={(
                <ProtectedRoute globalOnly>
                  <Agencies />
                </ProtectedRoute>
              )}
            />
            <Route path="agencies/:agencyId" element={<AgencyDetails />} />
            <Route path="users" element={<Users />} />
            <Route path="authorities" element={<Authorities />} />
            <Route path="alerts" element={<Alerts />} />
            <Route path="pins" element={<PinCategories />} />
            <Route path="reports" element={<Reports />} />
            <Route path="audit-logs" element={<AuditLogs />} />
            <Route path="settings" element={<Settings />} />
            <Route path="branding" element={<Settings />} />
            <Route path="import" element={<DataImport />} />
          </Route>
          
          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
};

const ProtectedRoute = ({ children, globalOnly = false }) => {
  const { isAuthenticated, user } = useSelector((state) => state.auth);
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (globalOnly && !isGlobalAdmin(user)) {
    return <Navigate to="/" replace />;
  }
  
  return children;
};

const App = () => {
  return (
    <Provider store={store}>
      <AppContent />
    </Provider>
  );
};

export default App;
