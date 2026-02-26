import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Avatar,
  Menu,
  MenuItem,
  Collapse
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  Business as BusinessIcon,
  People as PeopleIcon,
  Assignment as AssignmentIcon,
  Notifications as NotificationsIcon,
  Place as PlaceIcon,
  Assessment as AssessmentIcon,
  Settings as SettingsIcon,
  Palette as PaletteIcon,
  CloudUpload as CloudUploadIcon,
  History as HistoryIcon,
  AccountCircle as AccountCircleIcon,
  ExpandLess,
  ExpandMore,
  ExitToApp as ExitToAppIcon
} from '@mui/icons-material';
import { useSelector, useDispatch } from 'react-redux';
import { logout } from '../store/slices/authSlice';
import { getAgencyId, isGlobalAdmin } from '../utils/rbac';

const drawerWidth = 260;

const MainLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const globalAdmin = isGlobalAdmin(user);
  const userAgencyId = getAgencyId(user);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleProfileMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleProfileMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login');
  };

  const handleNavigate = (path) => {
    navigate(path);
    setMobileOpen(false);
  };

  const isActive = (path) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const menuItems = [
    { text: 'Dashboard', icon: <DashboardIcon />, path: '/' },
    ...(globalAdmin ? [{ text: 'Agencies', icon: <BusinessIcon />, path: '/agencies' }] : []),
    { text: 'Users', icon: <PeopleIcon />, path: '/users' },
    { text: 'Authorities', icon: <AssignmentIcon />, path: '/authorities' },
    { text: 'Alerts', icon: <NotificationsIcon />, path: '/alerts' },
    { text: 'Pin Categories', icon: <PlaceIcon />, path: '/pins' },
    { text: 'Reports', icon: <AssessmentIcon />, path: '/reports' },
    { text: 'Audit Logs', icon: <HistoryIcon />, path: '/audit-logs' },
    { text: 'Data Import', icon: <CloudUploadIcon />, path: '/import' },
  ];

  const settingsItems = [
    { text: 'System Settings', icon: <SettingsIcon />, path: '/settings' },
    { text: 'Branding', icon: <PaletteIcon />, path: '/branding' },
  ];

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Toolbar sx={{ bgcolor: '#000', borderBottom: '2px solid #FFD100' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <img 
            src="/RF-Logo.png" 
            alt="RailForge Analytics" 
            style={{ height: 40, width: 'auto' }}
          />
          <Box>
            <Typography variant="h6" noWrap component="div" fontWeight="bold">
              RailForge Analytics
            </Typography>
            <Typography variant="caption" sx={{ fontSize: '0.7rem', color: '#FFD100' }}>
              Forging data into safer rail operations
            </Typography>
          </Box>
        </Box>
      </Toolbar>

      <Box sx={{ overflow: 'auto', flexGrow: 1 }}>
        <List>
          {menuItems.map((item) => (
            <ListItem key={item.text} disablePadding>
              <ListItemButton
                onClick={() => handleNavigate(item.path)}
                selected={isActive(item.path)}
                sx={{
                  '&.Mui-selected': {
                    bgcolor: 'rgba(255, 209, 0, 0.15)',
                    borderLeft: '4px solid #FFD100',
                    '&:hover': {
                      bgcolor: 'rgba(255, 209, 0, 0.25)',
                    },
                  },
                  '&:hover': {
                    bgcolor: 'rgba(255, 209, 0, 0.08)',
                  },
                }}
              >
                <ListItemIcon sx={{ color: isActive(item.path) ? '#FFD100' : 'inherit' }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText 
                  primary={item.text}
                  primaryTypographyProps={{
                    fontWeight: isActive(item.path) ? 600 : 400
                  }}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>

        <Divider sx={{ my: 1 }} />

        <List>
          <ListItem disablePadding>
            <ListItemButton onClick={() => setSettingsOpen(!settingsOpen)}>
              <ListItemIcon>
                <SettingsIcon />
              </ListItemIcon>
              <ListItemText primary="Settings & Config" />
              {settingsOpen ? <ExpandLess /> : <ExpandMore />}
            </ListItemButton>
          </ListItem>
          <Collapse in={settingsOpen} timeout="auto" unmountOnExit>
            <List component="div" disablePadding>
              {settingsItems.map((item) => (
                <ListItem key={item.text} disablePadding>
                  <ListItemButton
                    onClick={() => handleNavigate(item.path)}
                    selected={isActive(item.path)}
                    sx={{
                      pl: 4,
                      '&.Mui-selected': {
                        bgcolor: 'rgba(255, 209, 0, 0.15)',
                        borderLeft: '4px solid #FFD100',
                        '&:hover': {
                          bgcolor: 'rgba(255, 209, 0, 0.25)',
                        },
                      },
                      '&:hover': {
                        bgcolor: 'rgba(255, 209, 0, 0.08)',
                      },
                    }}
                  >
                    <ListItemIcon sx={{ color: isActive(item.path) ? '#FFD100' : 'inherit' }}>
                      {item.icon}
                    </ListItemIcon>
                    <ListItemText 
                      primary={item.text}
                      primaryTypographyProps={{
                        fontWeight: isActive(item.path) ? 600 : 400,
                        fontSize: '0.9rem'
                      }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Collapse>
        </List>
      </Box>

      <Divider />
      <Box sx={{ p: 2, bgcolor: '#1E1E1E' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Avatar sx={{ bgcolor: '#FFD100', color: '#000', width: 36, height: 36 }}>
              {(user?.Employee_Name || user?.name || 'A').charAt(0)}
          </Avatar>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="body2" noWrap fontWeight={600}>
              {user?.Employee_Name || user?.name || 'Admin User'}
            </Typography>
            <Typography variant="caption" color="textSecondary" noWrap>
              {user?.Email || user?.email || 'admin@herzog.com'}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
          bgcolor: '#1E1E1E',
          borderBottom: '1px solid rgba(255, 209, 0, 0.2)',
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>

          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            {menuItems.find(item => isActive(item.path))?.text || 
             settingsItems.find(item => isActive(item.path))?.text || 
             'Admin Portal'}
          </Typography>

          <IconButton
            onClick={handleProfileMenuOpen}
            color="inherit"
            sx={{ ml: 2 }}
          >
            <AccountCircleIcon />
          </IconButton>

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleProfileMenuClose}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          >
            <MenuItem disabled>
              <Box>
                <Typography variant="body2" fontWeight={600}>
                  {user?.Employee_Name || user?.name || 'Admin User'}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  {user?.Role || user?.role || 'Administrator'}{userAgencyId ? ` • Agency ${userAgencyId}` : ''}
                </Typography>
              </Box>
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => { handleProfileMenuClose(); handleNavigate('/settings'); }}>
              <ListItemIcon>
                <SettingsIcon fontSize="small" />
              </ListItemIcon>
              Settings
            </MenuItem>
            <MenuItem onClick={() => { handleProfileMenuClose(); handleLogout(); }}>
              <ListItemIcon>
                <ExitToAppIcon fontSize="small" />
              </ListItemIcon>
              Logout
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true,
          }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
              bgcolor: '#1E1E1E',
            },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
              bgcolor: '#1E1E1E',
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          minHeight: '100vh',
          bgcolor: '#121212',
        }}
      >
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
};

export default MainLayout;
