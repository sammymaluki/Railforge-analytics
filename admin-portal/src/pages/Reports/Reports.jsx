import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Grid,
  Alert,
  CircularProgress,
  TextField,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider
} from '@mui/material';
import {
  Download as DownloadIcon,
  Assessment as AssessmentIcon,
  Security as SecurityIcon,
  Business as BusinessIcon,
  CheckCircle as ComplianceIcon,
  TrendingUp as UsageIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import api from '../../services/api';
import { useSelector } from 'react-redux';

const Reports = () => {
  const { user } = useSelector((state) => state.auth);
  const agencyId = Number(user?.Agency_ID || user?.agencyId || 1);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [selectedReportType, setSelectedReportType] = useState('');

  const [dateRange, setDateRange] = useState({
    startDate: format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd')
  });

  const reportTypes = [
    {
      id: 'safety',
      name: 'Safety Report',
      description: 'Comprehensive safety metrics including alerts, incidents, and compliance',
      icon: <SecurityIcon />,
      color: '#f44336'
    },
    {
      id: 'operations',
      name: 'Operations Report',
      description: 'Authority usage, worker activity, and operational efficiency metrics',
      icon: <BusinessIcon />,
      color: '#2196f3'
    },
    {
      id: 'compliance',
      name: 'Compliance Report',
      description: 'Regulatory compliance tracking and audit trail',
      icon: <ComplianceIcon />,
      color: '#4caf50'
    },
    {
      id: 'usage',
      name: 'Usage Statistics',
      description: 'System usage patterns, user activity, and feature adoption',
      icon: <UsageIcon />,
      color: '#ff9800'
    }
  ];

  const handleGenerateReport = async (reportType) => {
    if (!dateRange.startDate || !dateRange.endDate) {
      setError('Please select both start and end dates');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);
    setReportData(null);
    setSelectedReportType(reportType);

    try {
      const response = await api.post(`/analytics/${agencyId}/reports/${reportType}`, {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        options: {
          includeCharts: true,
          detailLevel: 'full'
        }
      });

      if (response.data.success) {
        setReportData(response.data.data);
        setSuccess(`${reportTypes.find(r => r.id === reportType)?.name} generated successfully!`);
      }
    } catch (err) {
      setError(err.response?.data?.message || `Failed to generate ${reportType} report`);
    } finally {
      setLoading(false);
    }
  };

  const handleExportReport = () => {
    if (!reportData) return;

    // Create downloadable JSON file
    const dataStr = JSON.stringify(reportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = window.URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedReportType}_report_${format(new Date(), 'yyyy-MM-dd')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const renderReportData = () => {
    if (!reportData) return null;

    return (
      <Paper sx={{ p: 3, mt: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h6">
            {reportTypes.find(r => r.id === selectedReportType)?.name}
          </Typography>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleExportReport}
          >
            Export Report
          </Button>
        </Box>

        <Divider sx={{ mb: 3 }} />

        {/* Summary Statistics */}
        {reportData.summary && (
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {Object.entries(reportData.summary).map(([key, value]) => (
              <Grid item xs={12} sm={6} md={3} key={key}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="body2" color="textSecondary" gutterBottom>
                      {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </Typography>
                    <Typography variant="h5">
                      {typeof value === 'number' ? value.toLocaleString() : value}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}

        {/* Detailed Data Tables */}
        {reportData.details && Array.isArray(reportData.details) && reportData.details.length > 0 && (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  {Object.keys(reportData.details[0]).map((key) => (
                    <TableCell key={key}>
                      <strong>{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</strong>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {reportData.details.slice(0, 10).map((row, index) => (
                  <TableRow key={index}>
                    {Object.values(row).map((value, cellIndex) => (
                      <TableCell key={cellIndex}>
                        {value !== null && value !== undefined ? String(value) : 'N/A'}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {reportData.details.length > 10 && (
              <Typography variant="body2" color="textSecondary" sx={{ p: 2, textAlign: 'center' }}>
                Showing 10 of {reportData.details.length} records. Export report for full data.
              </Typography>
            )}
          </TableContainer>
        )}

        {/* Raw Data Display */}
        {!reportData.summary && !reportData.details && (
          <Box sx={{ bgcolor: '#f5f5f5', p: 2, borderRadius: 1, maxHeight: 400, overflow: 'auto' }}>
            <pre style={{ margin: 0, fontSize: '12px' }}>
              {JSON.stringify(reportData, null, 2)}
            </pre>
          </Box>
        )}
      </Paper>
    );
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Reports
        </Typography>
        <Typography variant="body2" color="textSecondary">
          Generate comprehensive system reports for safety, operations, compliance, and usage analysis
        </Typography>
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

      {/* Date Range Selection */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Report Date Range
        </Typography>
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              label="Start Date"
              type="date"
              value={dateRange.startDate}
              onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              label="End Date"
              type="date"
              value={dateRange.endDate}
              onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
        </Grid>
      </Paper>

      {/* Report Type Cards */}
      <Grid container spacing={3}>
        {reportTypes.map((report) => (
          <Grid item xs={12} sm={6} md={6} key={report.id}>
            <Card
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                borderLeft: `4px solid ${report.color}`
              }}
            >
              <CardContent sx={{ flexGrow: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Box sx={{ color: report.color, mr: 2 }}>
                    {report.icon}
                  </Box>
                  <Typography variant="h6">
                    {report.name}
                  </Typography>
                </Box>
                <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                  {report.description}
                </Typography>
                <Button
                  fullWidth
                  variant="contained"
                  onClick={() => handleGenerateReport(report.id)}
                  disabled={loading}
                  sx={{ bgcolor: report.color, '&:hover': { bgcolor: report.color, opacity: 0.9 } }}
                >
                  {loading && selectedReportType === report.id ? (
                    <CircularProgress size={24} color="inherit" />
                  ) : (
                    <>
                      <AssessmentIcon sx={{ mr: 1 }} />
                      Generate Report
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Report Results */}
      {renderReportData()}
    </Box>
  );
};

export default Reports;
