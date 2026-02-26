import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  IconButton,
  Chip,
  TextField,
  InputAdornment,
  Grid,
  Card,
  CardContent,
  Alert,
  CircularProgress,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Divider
} from '@mui/material';
import {
  Search as SearchIcon,
  FilterList as FilterIcon,
  MoreVert as MoreVertIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Map as MapIcon,
  PushPin as PushPinIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import api from '../../services/api';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const API_ORIGIN = API_BASE.replace(/\/api\/?$/, '');

const resolvePhotoUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) return `${API_ORIGIN}${trimmed}`;
  return `${API_ORIGIN}/${trimmed}`;
};

const ActiveAuthorities = () => {
  const [authorities, setAuthorities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    overlaps: 0,
    nearExpiry: 0
  });
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedAuthority, setSelectedAuthority] = useState(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [authorityPins, setAuthorityPins] = useState([]);
  const [loadingPins, setLoadingPins] = useState(false);

  useEffect(() => {
    fetchAuthorities();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      fetchAuthorities();
    }, 30000);
    
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAuthorities = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get('/authorities/active');
      if (response.data.success) {
        const authoritiesData = response.data.data.authorities || response.data.data || [];
        setAuthorities(authoritiesData);
        
        // Update stats from the authorities data
        const now = new Date();
        const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
        
        setStats({
          active: authoritiesData.length,
          total: authoritiesData.length,
          overlaps: 0, // TODO: Calculate from overlap data
          nearExpiry: authoritiesData.filter(a => {
            if (!a.Expiration_Time) return false;
            const expiry = new Date(a.Expiration_Time);
            return expiry <= oneHourFromNow && expiry > now;
          }).length
        });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load active authorities');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleMenuClick = (event, authority) => {
    setAnchorEl(event.currentTarget);
    setSelectedAuthority(authority);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedAuthority(null);
  };

  const handleViewOnMap = () => {
    if (selectedAuthority) {
      // Open a new window/tab with the mobile app map view focused on this authority
      // For now, we'll show an alert with the authority details
      // TODO: Implement a proper map view in admin portal or deep link to mobile app
      alert(`Authority Details:\n\nSubdivision: ${selectedAuthority.Subdivision_Name}\nTrack: ${selectedAuthority.Track_Type} ${selectedAuthority.Track_Number}\nRange: MP ${selectedAuthority.Begin_MP} - MP ${selectedAuthority.End_MP}\n\nMap view feature coming soon!`);
    }
    handleMenuClose();
  };

  const fetchAuthorityPins = async (authorityId) => {
    setLoadingPins(true);
    try {
      const response = await api.get(`/pins/authority/${authorityId}`);
      if (response.data.success) {
        console.log('Fetched pins:', response.data.data);
        setAuthorityPins(response.data.data || []);
      }
    } catch (err) {
      console.error('Error fetching pins:', err);
      setAuthorityPins([]);
    } finally {
      setLoadingPins(false);
    }
  };

  const handleViewDetails = (authority = null) => {
    handleMenuClose();
    const authorityToView = authority || selectedAuthority;
    if (authorityToView) {
      fetchAuthorityPins(authorityToView.Authority_ID);
      setDetailDialogOpen(true);
      if (authority) {
        setSelectedAuthority(authority);
      }
    }
  };

  const handleCloseDetailDialog = () => {
    setDetailDialogOpen(false);
    setAuthorityPins([]);
  };

  const filteredAuthorities = authorities.filter((authority) =>
    Object.values(authority).some(
      (value) =>
        value &&
        value.toString().toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const paginatedAuthorities = filteredAuthorities.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  const getStatusIcon = (status) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return <CheckCircleIcon fontSize="small" />;
      case 'overlap':
        return <ErrorIcon fontSize="small" />;
      case 'warning':
        return <WarningIcon fontSize="small" />;
      default:
        return null;
    }
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const formatMilepost = (mp) => {
    return mp ? `MP ${parseFloat(mp).toFixed(2)}` : 'N/A';
  };

  return (
    <Box sx={{ p: 3 }}>
      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="body2">
          Displaying all currently active authorities. Overlaps and conflicts are highlighted in red.
          Authority data refreshes every 30 seconds automatically.
        </Typography>
      </Alert>

      {/* Statistics Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: '#1E1E1E' }}>
            <CardContent>
              <Typography color="textSecondary" gutterBottom variant="body2">
                Total Active
              </Typography>
              <Typography variant="h4" color="#FFD100">
                {stats.active}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: '#1E1E1E' }}>
            <CardContent>
              <Typography color="textSecondary" gutterBottom variant="body2">
                Overlaps Detected
              </Typography>
              <Typography variant="h4" color="error.main">
                {stats.overlaps}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: '#1E1E1E' }}>
            <CardContent>
              <Typography color="textSecondary" gutterBottom variant="body2">
                Near Expiry (1hr)
              </Typography>
              <Typography variant="h4" color="warning.main">
                {stats.nearExpiry}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: '#1E1E1E' }}>
            <CardContent>
              <Typography color="textSecondary" gutterBottom variant="body2">
                Total Authorities
              </Typography>
              <Typography variant="h4" color="info.main">
                {stats.total}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            Active Authorities
          </Typography>

          <TextField
            size="small"
            placeholder="Search authorities..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
            sx={{ width: 300 }}
          />
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#1E1E1E' }}>
                    <TableCell>Status</TableCell>
                    <TableCell>Authority Type</TableCell>
                    <TableCell>Subdivision</TableCell>
                    <TableCell>Track</TableCell>
                    <TableCell>Milepost Range</TableCell>
                    <TableCell>Employee</TableCell>
                    <TableCell>Start Time</TableCell>
                    <TableCell>Estimated End</TableCell>
                    <TableCell align="center">Pins</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedAuthorities.map((authority, index) => (
                    <TableRow
                      key={authority.Authority_ID || index}
                      sx={{
                        '&:hover': { bgcolor: 'action.hover' },
                        bgcolor: authority.Has_Overlap ? 'rgba(244, 67, 54, 0.1)' : 'transparent'
                      }}
                    >
                      <TableCell>
                        <Chip
                          icon={getStatusIcon('active')}
                          label="Active"
                          color="success"
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{authority.Authority_Type || 'N/A'}</TableCell>
                      <TableCell>{authority.Subdivision_Name || authority.Subdivision_Code || 'N/A'}</TableCell>
                      <TableCell>
                        {authority.Track_Type && authority.Track_Number
                          ? `${authority.Track_Type} ${authority.Track_Number}`
                          : 'N/A'}
                      </TableCell>
                      <TableCell>
                        {formatMilepost(authority.Begin_MP)} - {formatMilepost(authority.End_MP)}
                      </TableCell>
                      <TableCell>
                        {authority.Employee_Name_Display || authority.Employee_Name || 'N/A'}
                      </TableCell>
                      <TableCell>{formatDateTime(authority.Start_Time)}</TableCell>
                      <TableCell>{formatDateTime(authority.Expiration_Time)}</TableCell>
                      <TableCell align="center">
                        <Chip
                          icon={<PushPinIcon fontSize="small" />}
                          label={authority.Pin_Count || 0}
                          size="small"
                          color={authority.Pin_Count > 0 ? 'primary' : 'default'}
                          onClick={() => authority.Pin_Count > 0 && handleViewDetails(authority)}
                          sx={{ 
                            cursor: authority.Pin_Count > 0 ? 'pointer' : 'default',
                            '&:hover': authority.Pin_Count > 0 ? { backgroundColor: 'primary.dark' } : {}
                          }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <IconButton
                          size="small"
                          onClick={(e) => handleMenuClick(e, authority)}
                        >
                          <MoreVertIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}

                  {paginatedAuthorities.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} align="center">
                        <Typography variant="body2" color="textSecondary" sx={{ py: 3 }}>
                          {searchTerm
                            ? 'No authorities match your search'
                            : 'No active authorities found'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            <TablePagination
              component="div"
              count={filteredAuthorities.length}
              page={page}
              onPageChange={handleChangePage}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              rowsPerPageOptions={[5, 10, 25, 50]}
            />
          </>
        )}
      </Paper>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={handleViewOnMap}>
          <MapIcon sx={{ mr: 1 }} fontSize="small" />
          View on Map
        </MenuItem>
        <MenuItem onClick={handleViewDetails}>
          <FilterIcon sx={{ mr: 1 }} fontSize="small" />
          View Details
        </MenuItem>
      </Menu>

      {/* Authority Detail Dialog */}
      <Dialog
        open={detailDialogOpen}
        onClose={handleCloseDetailDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ bgcolor: '#1E1E1E', color: '#FFD100', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Authority Details
          <IconButton onClick={handleCloseDetailDialog} sx={{ color: '#FFD100' }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          {selectedAuthority && (
            <Box>
              {/* Authority Information */}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">Subdivision</Typography>
                  <Typography variant="body1" fontWeight="bold">
                    {selectedAuthority.Subdivision_Name || selectedAuthority.Subdivision_Code || 'N/A'}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">Track</Typography>
                  <Typography variant="body1" fontWeight="bold">
                    {selectedAuthority.Track_Type && selectedAuthority.Track_Number
                      ? `${selectedAuthority.Track_Type} ${selectedAuthority.Track_Number}`
                      : 'N/A'}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">Milepost Range</Typography>
                  <Typography variant="body1" fontWeight="bold">
                    {formatMilepost(selectedAuthority.Begin_MP)} - {formatMilepost(selectedAuthority.End_MP)}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">Employee</Typography>
                  <Typography variant="body1" fontWeight="bold">
                    {selectedAuthority.Employee_Name_Display || selectedAuthority.Employee_Name || 'N/A'}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">Start Time</Typography>
                  <Typography variant="body1">{formatDateTime(selectedAuthority.Start_Time)}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">Authority Type</Typography>
                  <Typography variant="body1">{selectedAuthority.Authority_Type || 'N/A'}</Typography>
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />

              {/* Pins Section */}
              <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
                <PushPinIcon sx={{ mr: 1 }} />
                Pins ({authorityPins.length})
              </Typography>

              {loadingPins ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress />
                </Box>
              ) : authorityPins.length === 0 ? (
                <Alert severity="info">
                  No pins have been dropped for this authority yet.
                </Alert>
              ) : (
                <Grid container spacing={2}>
                  {authorityPins.map((pin, index) => (
                    <Grid item xs={12} key={pin.Pin_ID || index}>
                      <Card sx={{ bgcolor: '#1E1E1E' }}>
                        <CardContent>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                            <Chip
                              label={pin.Pin_Category || 'Unknown'}
                              size="small"
                              sx={{ bgcolor: pin.Color || '#FFD100', fontWeight: 'bold' }}
                            />
                            <Typography variant="caption" color="textSecondary">
                              {formatDateTime(pin.Created_Date)}
                            </Typography>
                          </Box>

                          {resolvePhotoUrl(pin.Photo_URL) && (
                            <Box sx={{ my: 2 }}>
                              <img
                                src={resolvePhotoUrl(pin.Photo_URL)}
                                alt=""
                                style={{
                                  width: '100%',
                                  maxHeight: '300px',
                                  objectFit: 'contain',
                                  borderRadius: '8px'
                                }}
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                }}
                              />
                            </Box>
                          )}

                          {pin.Photo_URLs && !pin.Photo_URL && (
                            <Box sx={{ my: 2 }}>
                              {(() => {
                                try {
                                  const photoUrls = JSON.parse(pin.Photo_URLs)
                                    .map((url) => resolvePhotoUrl(url))
                                    .filter(Boolean);
                                  if (Array.isArray(photoUrls) && photoUrls.length > 0) {
                                    return (
                                      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 1 }}>
                                        {photoUrls.slice(0, 4).map((url, idx) => (
                                          <img
                                            key={idx}
                                            src={url}
                                            alt=""
                                            style={{
                                              width: '100%',
                                              maxHeight: '150px',
                                              objectFit: 'cover',
                                              borderRadius: '4px'
                                            }}
                                            onError={(e) => {
                                              e.target.style.display = 'none';
                                            }}
                                          />
                                        ))}
                                        {photoUrls.length > 4 && (
                                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#333', borderRadius: '4px' }}>
                                            <Typography variant="body2" color="textSecondary">+{photoUrls.length - 4} more</Typography>
                                          </Box>
                                        )}
                                      </Box>
                                    );
                                  }
                                  return null;
                                } catch (e) {
                                  return null;
                                }
                              })()}
                            </Box>
                          )}

                          {pin.Notes && (
                            <Typography variant="body2" sx={{ mb: 2 }}>
                              <strong>Notes:</strong> {pin.Notes}
                            </Typography>
                          )}

                          <Grid container spacing={1}>
                            <Grid item xs={6}>
                              <Typography variant="caption" color="textSecondary">Location</Typography>
                              <Typography variant="body2">
                                {pin.Latitude?.toFixed(6)}, {pin.Longitude?.toFixed(6)}
                              </Typography>
                            </Grid>
                            {pin.Track_Type && (
                              <Grid item xs={6}>
                                <Typography variant="caption" color="textSecondary">Track</Typography>
                                <Typography variant="body2">
                                  {pin.Track_Type} {pin.Track_Number}
                                </Typography>
                              </Grid>
                            )}
                            {pin.MP && (
                              <Grid item xs={6}>
                                <Typography variant="caption" color="textSecondary">Milepost</Typography>
                                <Typography variant="body2">
                                  MP {parseFloat(pin.MP).toFixed(2)}
                                </Typography>
                              </Grid>
                            )}
                          </Grid>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDetailDialog}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ActiveAuthorities;
