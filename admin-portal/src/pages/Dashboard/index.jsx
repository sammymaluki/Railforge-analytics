import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  IconButton,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Stack
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Warning,
  People,
  Assignment,
  Place as PlaceIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import analyticsService from '../../services/analyticsService';
import api from '../../services/api';
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip, Polyline, Circle } from 'react-leaflet';
import { LatLngBounds } from 'leaflet';
import 'leaflet/dist/leaflet.css';

const getColorByRole = (role) => {
  const normalized = String(role || '').toLowerCase();
  if (normalized.includes('administrator')) return '#ffd100';
  if (normalized.includes('supervisor')) return '#29b6f6';
  return '#66bb6a';
};

const getPointKey = (point, fallbackIndex = 0) => String(
  point?.userId ||
  point?.user?.employeeName ||
  `${point?.latitude || 0},${point?.longitude || 0},${fallbackIndex}`
);

const getOverlapRingRadiusMeters = (severity) => {
  switch (String(severity || '').toLowerCase()) {
    case 'critical': return 450;
    case 'high': return 320;
    case 'medium': return 220;
    default: return 150;
  }
};

const milesToMeters = (miles) => Number(miles || 0) * 1609.344;

const LiveMapPanel = ({ positions, boundaries, overlaps, proximityAlerts }) => {
  const validPoints = useMemo(() => positions
    .map((position, index) => ({
      ...position,
      pointKey: getPointKey(position, index),
      latitude: Number(position.latitude),
      longitude: Number(position.longitude)
    }))
    .filter((position) => Number.isFinite(position.latitude) && Number.isFinite(position.longitude)), [positions]);

  const [animatedPoints, setAnimatedPoints] = useState(validPoints);
  const previousPointsRef = useRef(validPoints);

  useEffect(() => {
    const previousPoints = previousPointsRef.current || [];
    const startByKey = new Map(previousPoints.map((point) => [point.pointKey, point]));
    const targetPoints = validPoints;
    if (targetPoints.length === 0) {
      setAnimatedPoints([]);
      previousPointsRef.current = [];
      return undefined;
    }

    const animationDurationMs = 900;
    const animationStart = performance.now();
    let animationFrameId = null;

    const animate = (now) => {
      const t = Math.min(1, (now - animationStart) / animationDurationMs);
      const eased = 1 - ((1 - t) * (1 - t));

      const interpolated = targetPoints.map((targetPoint) => {
        const fromPoint = startByKey.get(targetPoint.pointKey);
        if (!fromPoint) {
          return targetPoint;
        }

        return {
          ...targetPoint,
          latitude: fromPoint.latitude + ((targetPoint.latitude - fromPoint.latitude) * eased),
          longitude: fromPoint.longitude + ((targetPoint.longitude - fromPoint.longitude) * eased),
        };
      });

      setAnimatedPoints(interpolated);
      if (t < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        previousPointsRef.current = targetPoints;
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [validPoints]);

  const boundaryPolylines = useMemo(() => (Array.isArray(boundaries) ? boundaries : [])
    .map((boundary) => {
      const coords = boundary?.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) return null;
      return {
        authorityId: boundary?.properties?.authorityId,
        severity: 'normal',
        path: coords.map((pair) => [Number(pair[1]), Number(pair[0])]).filter((pair) => Number.isFinite(pair[0]) && Number.isFinite(pair[1])),
        properties: boundary?.properties || {}
      };
    })
    .filter((entry) => Array.isArray(entry.path) && entry.path.length >= 2), [boundaries]);

  const proximityRings = useMemo(() => {
    const latestByUser = new Map();
    (Array.isArray(proximityAlerts) ? proximityAlerts : []).forEach((alert) => {
      const userId = Number(alert?.User_ID);
      const distanceMiles = Number(alert?.Triggered_Distance);
      if (!Number.isFinite(userId) || !Number.isFinite(distanceMiles) || distanceMiles <= 0) return;
      const prev = latestByUser.get(userId);
      if (!prev || distanceMiles < prev.distanceMiles) {
        latestByUser.set(userId, { distanceMiles, alertLevel: alert?.Alert_Level });
      }
    });

    return animatedPoints.flatMap((point) => {
      const userId = Number(point.userId);
      const entry = latestByUser.get(userId);
      if (!entry) return [];
      return [{
        center: [point.latitude, point.longitude],
        radius: milesToMeters(entry.distanceMiles),
        level: entry.alertLevel,
      }];
    });
  }, [proximityAlerts, animatedPoints]);

  const overlapRings = useMemo(() => {
    const boundaryByAuthority = new Map(boundaryPolylines.map((boundary) => [Number(boundary.authorityId), boundary]));
    return (Array.isArray(overlaps) ? overlaps : []).map((overlap, index) => {
      const a1 = boundaryByAuthority.get(Number(overlap.Authority1_ID));
      const a2 = boundaryByAuthority.get(Number(overlap.Authority2_ID));
      const pickMidpoint = (path) => {
        if (!Array.isArray(path) || path.length < 2) return null;
        const start = path[0];
        const end = path[path.length - 1];
        return [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
      };

      const mid1 = a1 ? pickMidpoint(a1.path) : null;
      const mid2 = a2 ? pickMidpoint(a2.path) : null;
      let center = null;
      if (mid1 && mid2) {
        center = [(mid1[0] + mid2[0]) / 2, (mid1[1] + mid2[1]) / 2];
      } else {
        center = mid1 || mid2;
      }
      if (!center) return null;

      return {
        key: `${overlap.Overlap_ID || index}`,
        center,
        radius: getOverlapRingRadiusMeters(overlap.Severity),
        severity: overlap.Severity || 'Low'
      };
    }).filter(Boolean);
  }, [overlaps, boundaryPolylines]);

  const pointsForBounds = [
    ...animatedPoints.map((point) => [point.latitude, point.longitude]),
    ...boundaryPolylines.flatMap((boundary) => boundary.path),
    ...overlapRings.map((ring) => ring.center),
  ].filter((pair) => Number.isFinite(pair[0]) && Number.isFinite(pair[1]));

  if (pointsForBounds.length === 0) {
    return (
      <Box sx={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.secondary' }}>
        <Typography variant="body2">No live map data available for selected filters.</Typography>
      </Box>
    );
  }

  const bounds = new LatLngBounds(pointsForBounds);
  const center = bounds.getCenter();

  return (
    <Box
      sx={{
        position: 'relative',
        height: 320,
        borderRadius: 2,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.08)'
      }}
    >
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={13}
        style={{ width: '100%', height: '100%' }}
        scrollWheelZoom
        bounds={bounds}
        boundsOptions={{ padding: [30, 30] }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {boundaryPolylines.map((boundary) => (
          <Polyline
            key={`boundary-${boundary.authorityId}`}
            positions={boundary.path}
            pathOptions={{ color: '#00e5ff', weight: 4, opacity: 0.8 }}
          >
            <Tooltip sticky>
              Authority {boundary.properties.authorityId}: MP {boundary.properties.beginMP} - {boundary.properties.endMP}
            </Tooltip>
          </Polyline>
        ))}
        {proximityRings.map((ring, index) => (
          <Circle
            key={`proximity-ring-${index}`}
            center={ring.center}
            radius={ring.radius}
            pathOptions={{
              color: '#ffa726',
              weight: 2,
              opacity: 0.8,
              fillColor: '#ffa726',
              fillOpacity: 0.08
            }}
          />
        ))}
        {overlapRings.map((ring) => (
          <Circle
            key={`overlap-ring-${ring.key}`}
            center={ring.center}
            radius={ring.radius}
            pathOptions={{
              color: '#ff1744',
              weight: 3,
              opacity: 0.9,
              fillColor: '#ff1744',
              fillOpacity: 0.08
            }}
          >
            <Tooltip sticky>
              Overlap zone ({ring.severity})
            </Tooltip>
          </Circle>
        ))}
        {animatedPoints.map((point) => (
          <CircleMarker
            key={point.pointKey}
            center={[point.latitude, point.longitude]}
            radius={8}
            pathOptions={{
              color: '#000',
              weight: 2,
              fillColor: getColorByRole(point.user?.role),
              fillOpacity: 0.95
            }}
          >
            <Tooltip direction="top" offset={[0, -8]} opacity={1}>
              {point.user?.employeeName || 'User'}
            </Tooltip>
            <Popup>
              <Typography variant="subtitle2">{point.user?.employeeName || 'User'}</Typography>
              <Typography variant="body2">Role: {point.user?.role || 'Unknown'}</Typography>
              <Typography variant="body2">Lat: {point.latitude.toFixed(6)}</Typography>
              <Typography variant="body2">Lng: {point.longitude.toFixed(6)}</Typography>
              <Typography variant="body2">
                Speed: {Number.isFinite(Number(point.speed)) ? Number(point.speed).toFixed(1) : 'N/A'}
              </Typography>
              <Typography variant="body2">
                Accuracy: {Number.isFinite(Number(point.accuracy)) ? `${Number(point.accuracy).toFixed(1)} m` : 'N/A'}
              </Typography>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      <Box sx={{ position: 'absolute', bottom: 8, right: 8, bgcolor: 'rgba(0,0,0,0.65)', px: 1, py: 0.5, borderRadius: 1, zIndex: 500 }}>
        <Typography variant="caption" color="white">
          Live tile map ({animatedPoints.length} active)
        </Typography>
      </Box>
    </Box>
  );
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  const isGlobalAdmin = String(user?.Role || '').toLowerCase() === 'administrator';
  const userAgencyId = Number(user?.Agency_ID || user?.agencyId || 0);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [recentAlerts, setRecentAlerts] = useState([]);
  const [recentAuthorities, setRecentAuthorities] = useState([]);
  const [recentAuditLogs, setRecentAuditLogs] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [subdivisions, setSubdivisions] = useState([]);
  const [livePositions, setLivePositions] = useState([]);
  const [activeAuthorities, setActiveAuthorities] = useState([]);
  const [authorityBoundaries, setAuthorityBoundaries] = useState([]);
  const [overlaps, setOverlaps] = useState([]);
  const [proximityAlerts, setProximityAlerts] = useState([]);
  const [filters, setFilters] = useState({
    agencyId: userAgencyId || 1,
    subdivisionId: '',
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10)
  });

  const loadAgencies = useCallback(async () => {
    if (!isGlobalAdmin) return;
    const response = await api.get('/agencies');
    const agencyList = response?.data?.data?.agencies || response?.data?.data || [];
    setAgencies(Array.isArray(agencyList) ? agencyList : []);
  }, [isGlobalAdmin]);

  const loadSubdivisions = async (agencyId) => {
    if (!agencyId) {
      setSubdivisions([]);
      return;
    }
    const response = await api.get(`/agencies/${agencyId}/subdivisions`);
    const subdivisionList = response?.data?.data?.subdivisions || response?.data?.data || [];
    setSubdivisions(Array.isArray(subdivisionList) ? subdivisionList : []);
  };

  const fetchAuthorityBoundaries = async (authorityIds) => {
    const uniqueIds = [...new Set((authorityIds || []).map((id) => Number(id)).filter(Number.isFinite))];
    if (uniqueIds.length === 0) {
      return [];
    }

    const responses = await Promise.allSettled(
      uniqueIds.map((authorityId) => api.get(`/map/authority/${authorityId}/boundary`))
    );

    return responses
      .filter((result) => result.status === 'fulfilled' && result.value?.data?.success)
      .map((result) => result.value.data.data)
      .filter(Boolean);
  };

  const loadDashboardData = useCallback(async (forceRefresh = false, { silent = false } = {}) => {
    const agencyId = Number(filters.agencyId || userAgencyId || 1);
    if (!agencyId) return;

    try {
      if (forceRefresh) setRefreshing(true);
      if (!silent) setLoading(true);
      setError(null);

      const queryString = new URLSearchParams({
        startDate: filters.startDate,
        endDate: filters.endDate,
        limit: '5',
        sortBy: 'createdAt',
        sortOrder: 'desc'
      }).toString();

      const activeAuthorityQuery = filters.subdivisionId
        ? `?subdivisionId=${encodeURIComponent(filters.subdivisionId)}`
        : '';

      const [
        statsResponse,
        alertsResponse,
        authoritiesResponse,
        auditResponse,
        positionsResponse,
        activeAuthoritiesResponse,
        overlapsResponse,
        proximityResponse
      ] = await Promise.all([
        analyticsService.getDashboardStats(agencyId, {
          startDate: filters.startDate,
          endDate: filters.endDate,
          forceRefresh
        }),
        api.get(`/alerts/${agencyId}/history?${queryString}`),
        api.get(`/authorities/history/${agencyId}?${queryString}`),
        api.get(`/audit/${agencyId}/logs?${queryString}`),
        api.get('/gps/active-positions'),
        api.get(`/authorities/active${activeAuthorityQuery}`),
        api.get(`/authorities/overlaps/${agencyId}`),
        api.get(`/alerts/${agencyId}/history?${new URLSearchParams({
          startDate: filters.startDate,
          endDate: filters.endDate,
          alertType: 'Proximity',
          page: '1',
          limit: '50'
        }).toString()}`)
      ]);

      const positions = positionsResponse?.data?.data?.positions || [];
      const filteredPositions = positions.filter((position) => {
        if (!filters.subdivisionId) return true;
        return String(position?.authority?.subdivision || '') === String(
          subdivisions.find((sub) => String(sub.Subdivision_ID) === String(filters.subdivisionId))?.Subdivision_Code || ''
        );
      });

      const activeAuthorityList = activeAuthoritiesResponse?.data?.data?.authorities || [];
      const overlapList = overlapsResponse?.data?.data?.overlaps || [];
      const overlapAuthorityIds = overlapList.flatMap((overlap) => [overlap.Authority1_ID, overlap.Authority2_ID]);
      const boundaries = await fetchAuthorityBoundaries([
        ...activeAuthorityList.map((authority) => authority.Authority_ID),
        ...overlapAuthorityIds
      ]);

      setStats(statsResponse.data);
      setRecentAlerts(alertsResponse?.data?.data?.alerts || []);
      setRecentAuthorities(authoritiesResponse?.data?.data?.authorities || []);
      setRecentAuditLogs(auditResponse?.data?.data?.logs || []);
      setLivePositions(filteredPositions);
      setActiveAuthorities(activeAuthorityList);
      setAuthorityBoundaries(boundaries);
      setOverlaps(overlapList);
      setProximityAlerts(proximityResponse?.data?.data?.alerts || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load dashboard data');
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  }, [filters, userAgencyId, subdivisions]);

  useEffect(() => {
    loadAgencies();
  }, [loadAgencies]);

  useEffect(() => {
    loadSubdivisions(filters.agencyId);
  }, [filters.agencyId]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      loadDashboardData(false, { silent: true });
    }, 10000);

    return () => clearInterval(intervalId);
  }, [loadDashboardData]);

  const getAlertSeverityColor = (severity) => {
    switch (String(severity || '').toLowerCase()) {
      case 'critical': return 'error';
      case 'high': return 'warning';
      case 'medium': return 'info';
      case 'low': return 'success';
      default: return 'default';
    }
  };

  const getStatusColor = (status) => {
    switch (String(status || '').toLowerCase()) {
      case 'active': return 'success';
      case 'pending': return 'warning';
      case 'expired': return 'error';
      default: return 'default';
    }
  };

  const formatDate = (date) => (date ? new Date(date).toLocaleString() : 'N/A');

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant='h4'>Dashboard</Typography>
        <IconButton onClick={() => loadDashboardData(true)} disabled={refreshing} color="primary">
          <RefreshIcon />
        </IconButton>
      </Box>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <FormControl fullWidth>
            <InputLabel>Agency</InputLabel>
            <Select
              label="Agency"
              value={String(filters.agencyId || '')}
              disabled={!isGlobalAdmin}
              onChange={(e) => setFilters((prev) => ({ ...prev, agencyId: Number(e.target.value), subdivisionId: '' }))}
            >
              {(isGlobalAdmin ? agencies : [{ Agency_ID: userAgencyId, Agency_Name: user?.Agency_Name || 'My Agency' }])
                .map((agency) => (
                  <MenuItem key={agency.Agency_ID} value={String(agency.Agency_ID)}>
                    {agency.Agency_Name || `Agency ${agency.Agency_ID}`}
                  </MenuItem>
                ))}
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel>Subdivision</InputLabel>
            <Select
              label="Subdivision"
              value={String(filters.subdivisionId || '')}
              onChange={(e) => setFilters((prev) => ({ ...prev, subdivisionId: e.target.value }))}
            >
              <MenuItem value="">All</MenuItem>
              {subdivisions.map((subdivision) => (
                <MenuItem key={subdivision.Subdivision_ID} value={String(subdivision.Subdivision_ID)}>
                  {subdivision.Subdivision_Code || subdivision.Subdivision_Name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="Start Date"
            type="date"
            value={filters.startDate}
            onChange={(e) => setFilters((prev) => ({ ...prev, startDate: e.target.value }))}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            fullWidth
            label="End Date"
            type="date"
            value={filters.endDate}
            onChange={(e) => setFilters((prev) => ({ ...prev, endDate: e.target.value }))}
            InputLabelProps={{ shrink: true }}
          />
        </Stack>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card><CardContent><Typography color="text.secondary" variant="body2">Total Authorities</Typography><Typography variant="h4">{stats?.authorityStats?.total_authorities || 0}</Typography><Typography variant="caption" color="success.main">{stats?.authorityStats?.active_authorities || 0} Active</Typography></CardContent></Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card><CardContent><Typography color="text.secondary" variant="body2">Active Users</Typography><Typography variant="h4">{stats?.userStats?.active_users || 0}</Typography><Typography variant="caption" color="text.secondary">Total: {stats?.userStats?.total_users || 0}</Typography></CardContent></Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card><CardContent><Typography color="text.secondary" variant="body2">Alerts (Range)</Typography><Typography variant="h4">{stats?.alertStats?.alerts_today || 0}</Typography><Typography variant="caption" color="warning.main">{stats?.alertStats?.critical_alerts || 0} Critical</Typography></CardContent></Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card><CardContent><Typography color="text.secondary" variant="body2">System Status</Typography><Typography variant="h4">{stats?.systemStats?.database_status === 'healthy' ? 'OK' : 'ISSUE'}</Typography><Typography variant="caption" color="success.main">Audit + GPS monitoring enabled</Typography></CardContent></Card>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">Live Operations Map</Typography>
              <Chip icon={<PlaceIcon />} label={`${livePositions.length} active users`} size="small" color="info" />
            </Box>
            <LiveMapPanel
              positions={livePositions}
              boundaries={authorityBoundaries}
              overlaps={overlaps}
              proximityAlerts={proximityAlerts}
            />
            <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
              <Chip label={`Authorities: ${activeAuthorities.length}`} size="small" color="success" icon={<Assignment />} />
              <Chip label={`Overlaps: ${overlaps.length}`} size="small" color={overlaps.length > 0 ? 'error' : 'default'} icon={<Warning />} />
              <Chip label={`Proximity alerts: ${proximityAlerts.length}`} size="small" color={proximityAlerts.length > 0 ? 'warning' : 'default'} icon={<People />} />
            </Stack>
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Safety Signals</Typography>
            <Typography variant="body2" color="text.secondary">Overlapping limits and proximity events are refreshed with the dashboard.</Typography>
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2">Active overlaps: <strong>{overlaps.length}</strong></Typography>
              <Typography variant="body2">Recent proximity alerts: <strong>{proximityAlerts.length}</strong></Typography>
              <Typography variant="body2">Recent audit events: <strong>{recentAuditLogs.length}</strong></Typography>
            </Box>
            <Stack spacing={1} sx={{ mt: 2 }}>
              <Button size="small" onClick={() => navigate('/authorities')}>Open Authority Monitor</Button>
              <Button size="small" onClick={() => navigate('/alerts')}>Open Alert History</Button>
              <Button size="small" onClick={() => navigate('/audit-logs')}>Open Audit Logs</Button>
              <Button size="small" onClick={() => navigate('/reports')}>Open Reports & Export</Button>
            </Stack>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">Recent Authorities</Typography>
              <Button size="small" onClick={() => navigate('/authorities')}>View All</Button>
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead><TableRow><TableCell>Number</TableCell><TableCell>Status</TableCell><TableCell>Created</TableCell></TableRow></TableHead>
                <TableBody>
                  {recentAuthorities.length === 0 ? (
                    <TableRow><TableCell colSpan={3} align="center"><Typography variant="body2" color="text.secondary">No authorities found</Typography></TableCell></TableRow>
                  ) : recentAuthorities.map((authority, idx) => (
                    <TableRow key={authority.Authority_ID || `auth-${idx}`} hover sx={{ cursor: 'pointer' }} onClick={() => navigate('/authorities')}>
                      <TableCell>{authority.Authority_ID || 'N/A'}</TableCell>
                      <TableCell><Chip label={authority.Status || 'Unknown'} size="small" color={getStatusColor(authority.Status)} /></TableCell>
                      <TableCell><Typography variant="caption">{formatDate(authority.Created_Date)}</Typography></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">Recent Alerts</Typography>
              <Button size="small" onClick={() => navigate('/alerts')}>View All</Button>
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead><TableRow><TableCell>Type</TableCell><TableCell>Severity</TableCell><TableCell>Created</TableCell></TableRow></TableHead>
                <TableBody>
                  {recentAlerts.length === 0 ? (
                    <TableRow><TableCell colSpan={3} align="center"><Typography variant="body2" color="text.secondary">No alerts found</Typography></TableCell></TableRow>
                  ) : recentAlerts.map((alert, idx) => (
                    <TableRow key={alert.Alert_ID || `alert-${idx}`} hover>
                      <TableCell>{alert.Alert_Type || 'N/A'}</TableCell>
                      <TableCell><Chip label={alert.Alert_Level || 'Unknown'} size="small" color={getAlertSeverityColor(alert.Alert_Level)} /></TableCell>
                      <TableCell><Typography variant="caption">{formatDate(alert.Created_Date)}</Typography></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">Recent Activity</Typography>
              <Button size="small" onClick={() => navigate('/audit-logs')}>View All</Button>
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead><TableRow><TableCell>Action</TableCell><TableCell>Entity Type</TableCell><TableCell>User</TableCell><TableCell>Details</TableCell><TableCell>Timestamp</TableCell></TableRow></TableHead>
                <TableBody>
                  {recentAuditLogs.length === 0 ? (
                    <TableRow><TableCell colSpan={5} align="center"><Typography variant="body2" color="text.secondary">No recent activity</Typography></TableCell></TableRow>
                  ) : recentAuditLogs.map((log, idx) => (
                    <TableRow key={log.Log_ID || `log-${idx}`} hover>
                      <TableCell><Chip label={log.Action_Type || 'N/A'} size="small" variant="outlined" /></TableCell>
                      <TableCell>{log.Table_Name || 'N/A'}</TableCell>
                      <TableCell>{log.Employee_Name || 'System'}</TableCell>
                      <TableCell><Typography variant="caption" sx={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{log.Details || 'No details'}</Typography></TableCell>
                      <TableCell><Typography variant="caption">{formatDate(log.Created_Date)}</Typography></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;
