import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Grid,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  CardActions,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  Chip,
  FormControlLabel,
  Switch
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Download as DownloadIcon,
  Description as FileIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  Warning as WarningIcon
} from '@mui/icons-material';
import api from '../../services/api';
import { useSelector } from 'react-redux';

const DataImport = () => {
  const { user } = useSelector((state) => state.auth);
  const agencyId = Number(user?.Agency_ID || user?.agencyId || 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResults, setUploadResults] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [importType, setImportType] = useState(null);
  const [createMissingSubdivisions, setCreateMissingSubdivisions] = useState(false);
  const [useAgencyCodeFromFile, setUseAgencyCodeFromFile] = useState(false);
  const [createMissingAgencies, setCreateMissingAgencies] = useState(false);

  const importTypes = [
    {
      id: 'track-data',
      name: 'Track Data',
      description: 'Import subdivision, track type, and track number information',
      endpoint: '/upload/track-data',
      templateEndpoint: '/upload/templates/track-data',
      acceptedFormats: '.csv, .xlsx, .xls',
      icon: <FileIcon sx={{ fontSize: 40 }} />,
      color: '#2196f3',
      instructions: [
        'CSV or Excel format with columns: Subdivision_ID, Agency_ID, Track_Type, Track_Number, Begin_MP, End_MP',
        'Agency_ID is required to prevent overlapping names with other railroads',
        'Maximum 1000 records per file',
        'Duplicates will be skipped'
      ]
    },
    {
      id: 'milepost-geometry',
      name: 'Milepost Geometry',
      description: 'Import milepost location data with GPS coordinates',
      endpoint: '/upload/milepost-geometry',
      templateEndpoint: '/upload/templates/milepost-geometry',
      acceptedFormats: '.csv, .xlsx, .xls, .geojson',
      icon: <FileIcon sx={{ fontSize: 40 }} />,
      color: '#4caf50',
      instructions: [
        'CSV/Excel format with columns: Subdivision_ID, Agency_ID, Track_Type, Track_Number, MP, Latitude, Longitude',
        'Agency_ID is required to prevent overlapping names with other railroads',
        'Or GeoJSON format with milepost properties',
        'Coordinates must be in WGS84 (EPSG:4326)'
      ]
    },
    {
      id: 'users',
      name: 'User Data',
      description: 'Bulk import user accounts',
      endpoint: '/upload/users',
      templateEndpoint: '/upload/templates/users',
      acceptedFormats: '.csv, .xlsx',
      icon: <FileIcon sx={{ fontSize: 40 }} />,
      color: '#ff9800',
      instructions: [
        'CSV/Excel with columns: Username, Email, Full_Name, Role, Agency_CD',
        'Valid roles: Administrator, Supervisor, Field_Worker, Viewer',
        'Temporary passwords will be auto-generated'
      ]
    }
  ];

  const handleFileSelect = (event, type) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
      setImportType(type);
      setError(null);
      setSuccess(null);
      setUploadResults(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !importType) {
      setError('Please select a file to upload');
      return;
    }
    if (!agencyId) {
      setError('Unable to determine your agency. Please re-login and try again.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);
    setUploadProgress(0);
    setUploadResults(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      
      // Add required parameters based on import type
      if (importType.id === 'track-data') {
        formData.append('agencyId', String(agencyId));
        formData.append('dataType', 'tracks');
      } else if (importType.id === 'milepost-geometry') {
        formData.append('agencyId', String(agencyId));
        formData.append('dataType', 'mileposts');
      } else if (importType.id === 'users') {
        formData.append('agencyId', String(agencyId));
      }
      formData.append('createMissingSubdivisions', String(createMissingSubdivisions));
      formData.append('useAgencyCodeFromFile', String(useAgencyCodeFromFile));
      formData.append('createMissingAgencies', String(createMissingAgencies));

      const config = {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadProgress(percentCompleted);
        }
      };

      const response = await api.post(importType.endpoint, formData, config);

      if (response.data.success) {
        const results = response.data.data || {};
        setUploadResults(results);
        if ((results.imported || 0) > 0) {
          setSuccess(`Successfully imported ${selectedFile.name}`);
        } else {
          setError(`Upload completed, but no records were imported from ${selectedFile.name}. Review messages below.`);
        }
        setSelectedFile(null);
        setImportType(null);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to upload file');
      setUploadResults(err.response?.data?.data || null);
    } finally {
      setLoading(false);
      setUploadProgress(0);
    }
  };

  const handleDownloadTemplate = async (type) => {
    try {
      const response = await api.get(type.templateEndpoint, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${type.id}_template.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(`Failed to download template for ${type.name}`);
    }
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setImportType(null);
    setCreateMissingSubdivisions(false);
    setUseAgencyCodeFromFile(false);
    setCreateMissingAgencies(false);
    setError(null);
    setSuccess(null);
    setUploadResults(null);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Data Import
        </Typography>
        <Typography variant="body2" color="textSecondary">
          Bulk import track data, milepost geometry, and user information
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

      {/* Upload Progress */}
      {loading && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Uploading {selectedFile?.name}...
          </Typography>
          <LinearProgress variant="determinate" value={uploadProgress} />
          <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
            {uploadProgress}% complete
          </Typography>
        </Paper>
      )}

      {/* Upload Results */}
      {uploadResults && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Import Results
          </Typography>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {uploadResults.imported !== undefined && (
              <Grid item xs={12} sm={3}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="body2" color="textSecondary">
                      Imported
                    </Typography>
                    <Typography variant="h4" color="success.main">
                      {uploadResults.imported}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            )}
            {uploadResults.skipped !== undefined && (
              <Grid item xs={12} sm={3}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="body2" color="textSecondary">
                      Skipped
                    </Typography>
                    <Typography variant="h4" color="warning.main">
                      {uploadResults.skipped}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            )}
            {uploadResults.errors !== undefined && (
              <Grid item xs={12} sm={3}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="body2" color="textSecondary">
                      Errors
                    </Typography>
                    <Typography variant="h4" color="error.main">
                      {uploadResults.errors}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            )}
            {uploadResults.total !== undefined && (
              <Grid item xs={12} sm={3}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="body2" color="textSecondary">
                      Total Records
                    </Typography>
                    <Typography variant="h4">
                      {uploadResults.total}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            )}
          </Grid>

          {uploadResults.messages && uploadResults.messages.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                Messages:
              </Typography>
              <List dense>
                {uploadResults.messages.map((msg, index) => (
                  <ListItem key={index}>
                    <ListItemIcon>
                      {msg.type === 'error' ? (
                        <ErrorIcon color="error" />
                      ) : msg.type === 'warning' ? (
                        <WarningIcon color="warning" />
                      ) : (
                        <InfoIcon color="info" />
                      )}
                    </ListItemIcon>
                    <ListItemText primary={msg.message} />
                  </ListItem>
                ))}
              </List>
            </Box>
          )}
        </Paper>
      )}

      {/* File Selection */}
      {selectedFile && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography variant="h6" gutterBottom>
                Selected File
              </Typography>
              <Chip
                icon={<FileIcon />}
                label={`${selectedFile.name} (${(selectedFile.size / 1024).toFixed(2)} KB)`}
                color="primary"
                sx={{ mt: 1 }}
              />
            </Box>
            {(importType?.id === 'track-data' || importType?.id === 'milepost-geometry') && (
              <Box sx={{ mr: 2 }}>
                <FormControlLabel
                  control={(
                    <Switch
                      checked={createMissingSubdivisions}
                      onChange={(e) => setCreateMissingSubdivisions(e.target.checked)}
                    />
                  )}
                  label="Create missing subdivisions during import"
                />
                <Typography variant="caption" color="text.secondary" display="block">
                  Optional safe mode: creates missing subdivisions for this agency only.
                </Typography>
                <FormControlLabel
                  control={(
                    <Switch
                      checked={useAgencyCodeFromFile}
                      onChange={(e) => setUseAgencyCodeFromFile(e.target.checked)}
                    />
                  )}
                  label="Use Agency_CD from file"
                  sx={{ mt: 1 }}
                />
                <Typography variant="caption" color="text.secondary" display="block">
                  Global admin mode: routes each row by Agency_CD instead of your current agency.
                </Typography>
                <FormControlLabel
                  control={(
                    <Switch
                      checked={createMissingAgencies}
                      onChange={(e) => setCreateMissingAgencies(e.target.checked)}
                      disabled={!useAgencyCodeFromFile}
                    />
                  )}
                  label="Create missing agencies from Agency_CD"
                  sx={{ mt: 1 }}
                />
                <Typography variant="caption" color="text.secondary" display="block">
                  If Agency_CD does not exist, create it automatically (global admin only).
                </Typography>
              </Box>
            )}
            <Box>
              <Button onClick={handleClearFile} sx={{ mr: 1 }}>
                Cancel
              </Button>
              <Button
                variant="contained"
                onClick={handleUpload}
                disabled={loading}
                startIcon={loading ? <CircularProgress size={20} /> : <UploadIcon />}
              >
                Upload
              </Button>
            </Box>
          </Box>
        </Paper>
      )}

      {/* Import Type Cards */}
      <Grid container spacing={3}>
        {importTypes.map((type) => (
          <Grid item xs={12} md={6} lg={4} key={type.id}>
            <Card
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                borderTop: `4px solid ${type.color}`
              }}
            >
              <CardContent sx={{ flexGrow: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Box sx={{ color: type.color, mr: 2 }}>
                    {type.icon}
                  </Box>
                  <Typography variant="h6">
                    {type.name}
                  </Typography>
                </Box>
                <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                  {type.description}
                </Typography>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" gutterBottom>
                  Instructions:
                </Typography>
                <List dense>
                  {type.instructions.map((instruction, index) => (
                    <ListItem key={index}>
                      <ListItemIcon>
                        <InfoIcon fontSize="small" color="action" />
                      </ListItemIcon>
                      <ListItemText
                        primary={instruction}
                        primaryTypographyProps={{ variant: 'body2' }}
                      />
                    </ListItem>
                  ))}
                </List>
                <Chip
                  label={`Accepts: ${type.acceptedFormats}`}
                  size="small"
                  sx={{ mt: 1 }}
                />
              </CardContent>
              <CardActions>
                <Button
                  size="small"
                  startIcon={<DownloadIcon />}
                  onClick={() => handleDownloadTemplate(type)}
                >
                  Download Template
                </Button>
                <Button
                  size="small"
                  component="label"
                  startIcon={<UploadIcon />}
                  sx={{ ml: 'auto' }}
                >
                  Select File
                  <input
                    type="file"
                    hidden
                    accept={type.acceptedFormats}
                    onChange={(e) => handleFileSelect(e, type)}
                  />
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default DataImport;
