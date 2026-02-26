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
  Chip,
  TextField,
  Button,
  Grid,
  Alert,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Card,
  CardContent
} from '@mui/material';
import {
  Search as SearchIcon,
  FilterList as FilterListIcon,
  GetApp as GetAppIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import api from '../../services/api';
import { useSelector } from 'react-redux';

const AuthorityHistory = () => {
  const { user } = useSelector((state) => state.auth);
  const agencyId = Number(user?.Agency_ID || user?.agencyId || 1);

  const [authorities, setAuthorities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [showFilters, setShowFilters] = useState(false);

  // Filter states
  const [filters, setFilters] = useState({
    startDate: null,
    endDate: null,
    authorityType: '',
    subdivision: '',
    status: '',
    employeeName: ''
  });

  const [stats, setStats] = useState({
    totalRecords: 0,
    totalDuration: 0,
    avgDuration: 0,
    mostCommonType: ''
  });

  useEffect(() => {
    fetchAuthorityHistory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const fetchAuthorityHistory = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = {
        startDate: filters.startDate?.toISOString(),
        endDate: filters.endDate?.toISOString(),
        authorityType: filters.authorityType,
        subdivision: filters.subdivision,
        employeeName: filters.employeeName
      };

      // Remove null/empty params
      Object.keys(params).forEach(key => {
        if (!params[key]) delete params[key];
      });

      const response = await api.get(`/authorities/history/${agencyId}`, { params });
      if (response.data.success) {
        const authoritiesData = response.data.data.authorities || response.data.data || [];
        setAuthorities(authoritiesData);
        
        // Calculate stats from the data
        calculateStats(authoritiesData);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load authority history');
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (authoritiesData) => {
    if (authoritiesData.length === 0) {
      setStats({
        totalRecords: 0,
        totalDuration: 0,
        avgDuration: 0,
        mostCommonType: 'N/A'
      });
      return;
    }

    const totalRecords = authoritiesData.length;
    const totalDurationMinutes = authoritiesData.reduce((sum, auth) => {
      return sum + (auth.Duration_Minutes || 0);
    }, 0);
    const avgDurationMinutes = totalDurationMinutes / totalRecords;

    // Find most common type
    const typeCounts = authoritiesData.reduce((acc, auth) => {
      acc[auth.Authority_Type] = (acc[auth.Authority_Type] || 0) + 1;
      return acc;
    }, {});
    const mostCommonType = Object.keys(typeCounts).reduce((a, b) => 
      typeCounts[a] > typeCounts[b] ? a : b, 'N/A'
    );

    setStats({
      totalRecords,
      totalDuration: Math.floor(totalDurationMinutes / 60),
      avgDuration: Math.floor(avgDurationMinutes / 60),
      mostCommonType
    });
  };

  const handleExportToExcel = async () => {
    try {
      const response = await api.get(`/authorities/${agencyId}/history/export`, {
        responseType: 'blob',
        params: {
          startDate: filters.startDate?.toISOString(),
          endDate: filters.endDate?.toISOString()
        }
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `authority_history_${new Date().toISOString()}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleClearFilters = () => {
    setFilters({
      startDate: null,
      endDate: null,
      authorityType: '',
      subdivision: '',
      status: '',
      employeeName: ''
    });
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

  const formatDateTime = (dateStr) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const formatDuration = (start, end) => {
    if (!start || !end) return 'N/A';
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diffMs = endDate - startDate;
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const formatMilepost = (mp) => {
    return mp ? `MP ${parseFloat(mp).toFixed(2)}` : 'N/A';
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'success';
      case 'cancelled':
        return 'error';
      case 'expired':
        return 'warning';
      default:
        return 'default';
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="body2">
            Historical authority data is retained for auditing and analysis. 
            Use filters to narrow down results by date range, type, or employee.
          </Typography>
        </Alert>

        {/* Statistics Cards */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ bgcolor: '#1E1E1E' }}>
              <CardContent>
                <Typography color="textSecondary" gutterBottom variant="body2">
                  Total Records
                </Typography>
                <Typography variant="h4" color="#FFD100">
                  {stats.totalRecords}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ bgcolor: '#1E1E1E' }}>
              <CardContent>
                <Typography color="textSecondary" gutterBottom variant="body2">
                  Total Duration
                </Typography>
                <Typography variant="h4" color="info.main">
                  {stats.totalDuration}h
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ bgcolor: '#1E1E1E' }}>
              <CardContent>
                <Typography color="textSecondary" gutterBottom variant="body2">
                  Average Duration
                </Typography>
                <Typography variant="h4" color="success.main">
                  {stats.avgDuration}h
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ bgcolor: '#1E1E1E' }}>
              <CardContent>
                <Typography color="textSecondary" gutterBottom variant="body2">
                  Most Common Type
                </Typography>
                <Typography variant="h6" color="warning.main">
                  {stats.mostCommonType || 'N/A'}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Paper sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">
              Authority History
            </Typography>

            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                startIcon={<FilterListIcon />}
                onClick={() => setShowFilters(!showFilters)}
              >
                Filters
              </Button>
              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={fetchAuthorityHistory}
              >
                Refresh
              </Button>
              <Button
                variant="contained"
                startIcon={<GetAppIcon />}
                onClick={handleExportToExcel}
                sx={{ bgcolor: '#FFD100', color: '#000', '&:hover': { bgcolor: '#E6BC00' } }}
              >
                Export to Excel
              </Button>
            </Box>
          </Box>

          {showFilters && (
            <Paper sx={{ p: 2, mb: 2, bgcolor: '#1E1E1E' }}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <DatePicker
                    label="Start Date"
                    value={filters.startDate}
                    onChange={(date) => setFilters({ ...filters, startDate: date })}
                    renderInput={(params) => <TextField {...params} fullWidth size="small" />}
                  />
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                  <DatePicker
                    label="End Date"
                    value={filters.endDate}
                    onChange={(date) => setFilters({ ...filters, endDate: date })}
                    renderInput={(params) => <TextField {...params} fullWidth size="small" />}
                  />
                </Grid>

                <Grid item xs={12} sm={6} md={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Authority Type</InputLabel>
                    <Select
                      value={filters.authorityType}
                      label="Authority Type"
                      onChange={(e) => setFilters({ ...filters, authorityType: e.target.value })}
                    >
                      <MenuItem value="">All</MenuItem>
                      <MenuItem value="Track Authority">Track Authority</MenuItem>
                      <MenuItem value="Work Authority">Work Authority</MenuItem>
                      <MenuItem value="Temporary Speed Order">Temporary Speed Order</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} sm={6} md={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Status</InputLabel>
                    <Select
                      value={filters.status}
                      label="Status"
                      onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                    >
                      <MenuItem value="">All</MenuItem>
                      <MenuItem value="completed">Completed</MenuItem>
                      <MenuItem value="cancelled">Cancelled</MenuItem>
                      <MenuItem value="expired">Expired</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} sm={12} md={2}>
                  <Button
                    fullWidth
                    variant="outlined"
                    onClick={handleClearFilters}
                  >
                    Clear Filters
                  </Button>
                </Grid>
              </Grid>
            </Paper>
          )}

          <TextField
            fullWidth
            size="small"
            placeholder="Search authority history..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
            }}
            sx={{ mb: 2 }}
          />

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
                      <TableCell>End Time</TableCell>
                      <TableCell>Duration</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginatedAuthorities.map((authority, index) => (
                      <TableRow
                        key={authority.Authority_ID || index}
                        sx={{ '&:hover': { bgcolor: 'action.hover' } }}
                      >
                        <TableCell>
                          <Chip
                            label={authority.Status || 'Completed'}
                            color={getStatusColor(authority.Status)}
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
                        <TableCell>{authority.Employee_Name_Display || authority.Employee_Name || 'N/A'}</TableCell>
                        <TableCell>{formatDateTime(authority.Start_Time)}</TableCell>
                        <TableCell>{formatDateTime(authority.End_Tracking_Time)}</TableCell>
                        <TableCell>
                          {formatDuration(authority.Start_Time, authority.End_Tracking_Time)}
                        </TableCell>
                      </TableRow>
                    ))}

                    {paginatedAuthorities.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} align="center">
                          <Typography variant="body2" color="textSecondary" sx={{ py: 3 }}>
                            {searchTerm || Object.values(filters).some(v => v)
                              ? 'No authorities match your filters'
                              : 'No authority history found'}
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
                rowsPerPageOptions={[5, 10, 25, 50, 100]}
              />
            </>
          )}
        </Paper>
      </LocalizationProvider>
    </Box>
  );
};

export default AuthorityHistory;
