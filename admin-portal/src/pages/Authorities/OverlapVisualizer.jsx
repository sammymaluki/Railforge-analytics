import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  Alert,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow
} from '@mui/material';
import {
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  Refresh as RefreshIcon,
  Timeline as TimelineIcon
} from '@mui/icons-material';
import api from '../../services/api';
import { useSelector } from 'react-redux';

const OverlapVisualizer = () => {
  const { user } = useSelector((state) => state.auth);
  const agencyId = Number(user?.Agency_ID || user?.agencyId || 1);

  const [overlaps, setOverlaps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedOverlap, setSelectedOverlap] = useState(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [stats, setStats] = useState({
    totalOverlaps: 0,
    criticalOverlaps: 0,
    resolvedToday: 0,
    avgResolutionTime: 0
  });

  useEffect(() => {
    fetchOverlaps();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchOverlaps = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get(`/authorities/overlaps/${agencyId}`);
      if (response.data.success) {
        const overlapsData = response.data.data.overlaps || [];
        const statsData = response.data.data.stats || {};
        setOverlaps(overlapsData);
        setStats(statsData);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load authority overlaps');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (overlap) => {
    setSelectedOverlap(overlap);
    setDetailDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDetailDialogOpen(false);
    setSelectedOverlap(null);
  };

  const handleResolveOverlap = async () => {
    if (!selectedOverlap) return;

    try {
      const response = await api.post(`/authorities/overlaps/${selectedOverlap.Overlap_ID}/resolve`, {
        notes: 'Resolved via admin portal'
      });

      if (response.data.success) {
        // Close dialog and refresh overlaps
        handleCloseDialog();
        fetchOverlaps();
      }
    } catch (err) {
      console.error('Failed to resolve overlap:', err);
      setError(err.response?.data?.error || 'Failed to resolve overlap');
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'critical':
        return 'error';
      case 'high':
        return 'warning';
      case 'medium':
        return 'info';
      case 'low':
        return 'success';
      default:
        return 'default';
    }
  };

  const getSeverityIcon = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'critical':
        return <ErrorIcon />;
      case 'high':
        return <WarningIcon />;
      case 'medium':
        return <InfoIcon />;
      case 'low':
        return <CheckCircleIcon />;
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

  const calculateOverlapLength = (overlap) => {
    if (!overlap.Overlap_Begin_MP || !overlap.Overlap_End_MP) return 'Unknown';
    const length = parseFloat(overlap.Overlap_End_MP) - parseFloat(overlap.Overlap_Begin_MP);
    return `${length.toFixed(2)} miles`;
  };

  return (
    <Box sx={{ p: 3 }}>
      <Alert severity="warning" sx={{ mb: 3 }} icon={<WarningIcon />}>
        <Typography variant="body2">
          <strong>Authority Overlap Detection:</strong> This tool visualizes authorities that overlap in space or time. 
          Critical overlaps require immediate attention to prevent safety hazards. Email notifications are automatically 
          sent to Ryan Medlin when overlaps are detected.
        </Typography>
      </Alert>

      {/* Statistics Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: '#1E1E1E' }}>
            <CardContent>
              <Typography color="textSecondary" gutterBottom variant="body2">
                Total Overlaps
              </Typography>
              <Typography variant="h4" color="#FFD100">
                {stats.totalOverlaps}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: '#1E1E1E' }}>
            <CardContent>
              <Typography color="textSecondary" gutterBottom variant="body2">
                Critical Overlaps
              </Typography>
              <Typography variant="h4" color="error.main">
                {stats.criticalOverlaps}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: '#1E1E1E' }}>
            <CardContent>
              <Typography color="textSecondary" gutterBottom variant="body2">
                Resolved Today
              </Typography>
              <Typography variant="h4" color="success.main">
                {stats.resolvedToday}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: '#1E1E1E' }}>
            <CardContent>
              <Typography color="textSecondary" gutterBottom variant="body2">
                Avg Resolution Time
              </Typography>
              <Typography variant="h4" color="info.main">
                {stats.avgResolutionTime}m
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            Active Overlap Conflicts
          </Typography>

          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchOverlaps}
          >
            Refresh
          </Button>
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
        ) : overlaps.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <CheckCircleIcon sx={{ fontSize: 60, color: 'success.main', mb: 2 }} />
            <Typography variant="h6" color="success.main">
              No Overlaps Detected
            </Typography>
            <Typography variant="body2" color="textSecondary">
              All active authorities are properly separated
            </Typography>
          </Box>
        ) : (
          <Grid container spacing={2}>
            {overlaps.map((overlap, index) => (
              <Grid item xs={12} key={overlap.id || index}>
                <Card
                  sx={{
                    border: 2,
                    borderColor: overlap.severity === 'critical' ? 'error.main' : 'warning.main',
                    bgcolor: overlap.severity === 'critical' ? 'rgba(244, 67, 54, 0.05)' : 'rgba(255, 152, 0, 0.05)'
                  }}
                >
                  <CardContent>
                    <Grid container spacing={2}>
                      <Grid item xs={12} md={8}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                          <Chip
                            icon={getSeverityIcon(overlap.Severity)}
                            label={overlap.Severity?.toUpperCase() || 'UNKNOWN'}
                            color={getSeverityColor(overlap.Severity)}
                            sx={{ mr: 2 }}
                          />
                          <Typography variant="h6">
                            Overlap Detected
                          </Typography>
                        </Box>

                        <Grid container spacing={2} sx={{ mt: 1 }}>
                          <Grid item xs={12} sm={6}>
                            <Typography variant="caption" color="textSecondary">
                              Authority 1:
                            </Typography>
                            <Typography variant="body2" fontWeight="bold">
                              {overlap.Authority1_Type} - {overlap.Authority1_Subdivision}
                            </Typography>
                            <Typography variant="body2" color="textSecondary">
                              {overlap.Authority1_Employee}
                            </Typography>
                            <Typography variant="body2">
                              {formatMilepost(overlap.Authority1_Begin_MP)} to {formatMilepost(overlap.Authority1_End_MP)}
                            </Typography>
                            <Typography variant="body2" color="textSecondary">
                              Track: {overlap.Authority1_Track_Type} {overlap.Authority1_Track_Number}
                            </Typography>
                          </Grid>

                          <Grid item xs={12} sm={6}>
                            <Typography variant="caption" color="textSecondary">
                              Authority 2:
                            </Typography>
                            <Typography variant="body2" fontWeight="bold">
                              {overlap.Authority2_Type} - {overlap.Authority2_Subdivision}
                            </Typography>
                            <Typography variant="body2" color="textSecondary">
                              {overlap.Authority2_Employee}
                            </Typography>
                            <Typography variant="body2">
                              {formatMilepost(overlap.Authority2_Begin_MP)} to {formatMilepost(overlap.Authority2_End_MP)}
                            </Typography>
                            <Typography variant="body2" color="textSecondary">
                              Track: {overlap.Authority2_Track_Type} {overlap.Authority2_Track_Number}
                            </Typography>
                          </Grid>
                        </Grid>
                      </Grid>

                      <Grid item xs={12} md={4}>
                        <List dense>
                          <ListItem>
                            <ListItemText
                              primary="Overlap Range"
                              secondary={`${formatMilepost(overlap.Overlap_Begin_MP)} - ${formatMilepost(overlap.Overlap_End_MP)}`}
                            />
                          </ListItem>
                          <ListItem>
                            <ListItemText
                              primary="Overlap Length"
                              secondary={calculateOverlapLength(overlap)}
                            />
                          </ListItem>
                          <ListItem>
                            <ListItemText
                              primary="Detected At"
                              secondary={formatDateTime(overlap.Overlap_Detected_Time)}
                            />
                          </ListItem>
                        </List>

                        <Button
                          fullWidth
                          variant="outlined"
                          size="small"
                          startIcon={<TimelineIcon />}
                          onClick={() => handleViewDetails(overlap)}
                          sx={{ mt: 1 }}
                        >
                          View Details
                        </Button>
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Paper>

      {/* Detail Dialog */}
      <Dialog
        open={detailDialogOpen}
        onClose={handleCloseDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Overlap Conflict Details
        </DialogTitle>
        <DialogContent>
          {selectedOverlap && (
            <Box sx={{ pt: 2 }}>
              <Alert severity={selectedOverlap.Severity === 'Critical' ? 'error' : 'warning'} sx={{ mb: 3 }}>
                <Typography variant="body2">
                  <strong>Severity:</strong> {selectedOverlap.Severity?.toUpperCase()}
                  <br />
                  <strong>Detected:</strong> {formatDateTime(selectedOverlap.Overlap_Detected_Time)}
                  <br />
                  <strong>Status:</strong> {selectedOverlap.Is_Resolved ? 'Resolved' : 'Active'}
                </Typography>
              </Alert>

              <Typography variant="h6" gutterBottom>
                Overlapping Authorities
              </Typography>

              <TableContainer component={Paper} sx={{ mb: 3 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#1E1E1E' }}>
                      <TableCell>Field</TableCell>
                      <TableCell>Authority 1</TableCell>
                      <TableCell>Authority 2</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    <TableRow>
                      <TableCell>Type</TableCell>
                      <TableCell>{selectedOverlap.Authority1_Type}</TableCell>
                      <TableCell>{selectedOverlap.Authority2_Type}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Subdivision</TableCell>
                      <TableCell>{selectedOverlap.Authority1_Subdivision}</TableCell>
                      <TableCell>{selectedOverlap.Authority2_Subdivision}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Track</TableCell>
                      <TableCell>{selectedOverlap.Authority1_Track_Type} {selectedOverlap.Authority1_Track_Number}</TableCell>
                      <TableCell>{selectedOverlap.Authority2_Track_Type} {selectedOverlap.Authority2_Track_Number}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Employee</TableCell>
                      <TableCell>{selectedOverlap.Authority1_Employee}</TableCell>
                      <TableCell>{selectedOverlap.Authority2_Employee}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Contact</TableCell>
                      <TableCell>{selectedOverlap.Authority1_Contact}</TableCell>
                      <TableCell>{selectedOverlap.Authority2_Contact}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Milepost Range</TableCell>
                      <TableCell>
                        {formatMilepost(selectedOverlap.Authority1_Begin_MP)} - {formatMilepost(selectedOverlap.Authority1_End_MP)}
                      </TableCell>
                      <TableCell>
                        {formatMilepost(selectedOverlap.Authority2_Begin_MP)} - {formatMilepost(selectedOverlap.Authority2_End_MP)}
                      </TableCell>
                    </TableRow>
                    <TableRow sx={{ bgcolor: 'rgba(255, 209, 0, 0.1)' }}>
                      <TableCell><strong>Overlap Range</strong></TableCell>
                      <TableCell colSpan={2}>
                        <strong>
                          {formatMilepost(selectedOverlap.Overlap_Begin_MP)} - {formatMilepost(selectedOverlap.Overlap_End_MP)}
                          {' '}({calculateOverlapLength(selectedOverlap)})
                        </strong>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>

              <Typography variant="h6" gutterBottom>
                Recommended Actions
              </Typography>

              <List>
                <ListItem>
                  <ListItemText
                    primary="1. Contact both employees immediately"
                    secondary="Verify the overlap and determine if authorities can be adjusted"
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="2. Review authority types and requirements"
                    secondary="Ensure both authorities are necessary and cannot be combined"
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="3. Modify authority boundaries if possible"
                    secondary="Adjust milepost ranges to eliminate overlap"
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="4. Document resolution"
                    secondary="Record actions taken to resolve the conflict for audit purposes"
                  />
                </ListItem>
              </List>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>
            Close
          </Button>
          <Button
            variant="contained"
            sx={{ bgcolor: '#FFD100', color: '#000', '&:hover': { bgcolor: '#E6BC00' } }}
            onClick={handleResolveOverlap}
          >
            Mark as Resolved
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default OverlapVisualizer;
