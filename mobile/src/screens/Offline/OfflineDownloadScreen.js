import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import theme from '../../constants/theme';
import { CONFIG } from '../../constants/config';
import apiService from '../../services/api/ApiService';

const OfflineDownloadScreen = ({ navigation }) => {
  const { user } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  
  const [agencies, setAgencies] = useState([]);
  const [subdivisions, setSubdivisions] = useState([]);
  const [selectedAgency, setSelectedAgency] = useState(null);
  const [downloads, setDownloads] = useState([]);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [storageInfo, setStorageInfo] = useState({ used: 0, available: 0 });

  useEffect(() => {
    loadAgencies();
    loadDownloads();
    calculateStorage();
  }, []);

  useEffect(() => {
    if (selectedAgency) {
      loadSubdivisions(selectedAgency);
    }
  }, [selectedAgency]);

  const loadAgencies = async () => {
    try {
      const response = await apiService.getAgencies(1, 200, '');
      if (response?.success) {
        setAgencies(response.data?.agencies || []);
      } else {
        setAgencies([]);
      }
      
      // Auto-select user's agency
      if (user.Agency_ID) {
        setSelectedAgency(user.Agency_ID);
      }
    } catch (error) {
      console.error('Error loading agencies:', error);
      setAgencies([]);
    }
  };

  const loadSubdivisions = async (agencyId) => {
    try {
      const response = await apiService.getAgencySubdivisions(agencyId);
      if (response?.success) {
        setSubdivisions(response.data || []);
      } else {
        setSubdivisions([]);
      }
    } catch (error) {
      console.error('Error loading subdivisions:', error);
      setSubdivisions([]);
    }
  };

  const loadDownloads = async () => {
    try {
      const stored = await AsyncStorage.getItem('offline_downloads');
      if (stored) {
        setDownloads(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading downloads:', error);
    }
  };

  const calculateStorage = async () => {
    try {
      const dirInfo = await FileSystem.getInfoAsync(FileSystem.documentDirectory);
      if (dirInfo.exists) {
        // Calculate used space by summing download sizes
        const stored = await AsyncStorage.getItem('offline_downloads');
        if (stored) {
          const downloads = JSON.parse(stored);
          const used = downloads.reduce((sum, d) => sum + (d.size || 0), 0);
          setStorageInfo({
            used: used / (1024 * 1024), // Convert to MB
            available: 1000, // Approximate available space in MB
          });
        }
      }
    } catch (error) {
      console.error('Error calculating storage:', error);
    }
  };

  const downloadSubdivision = async (subdivision) => {
    try {
      setDownloading(true);
      setDownloadProgress(0);

      // Download track geometry and mileposts
      const response = await fetch(
        `${CONFIG.API.BASE_URL}/offline/agency/${selectedAgency}/subdivision/${subdivision.Subdivision_ID}`,
        {
          headers: {
            'Authorization': `Bearer ${user?.token}`
          }
        }
      );

      if (!response.ok) throw new Error('Download failed');

      const data = await response.json();

      // Save to local storage
      const fileUri = `${FileSystem.documentDirectory}subdivision_${subdivision.Subdivision_ID}.json`;
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(data));

      // Get file info
      const fileInfo = await FileSystem.getInfoAsync(fileUri);

      // Update downloads list
      const downloadRecord = {
        subdivisionId: subdivision.Subdivision_ID,
        subdivisionName: subdivision.Subdivision_Name,
        agencyId: selectedAgency,
        fileUri,
        size: fileInfo.size,
        downloadDate: new Date().toISOString(),
        mileposts: data.mileposts?.length || 0,
        pins: data.pins?.length || 0,
      };

      const updatedDownloads = [...downloads.filter(d => d.subdivisionId !== subdivision.Subdivision_ID), downloadRecord];
      setDownloads(updatedDownloads);
      await AsyncStorage.setItem('offline_downloads', JSON.stringify(updatedDownloads));

      await calculateStorage();

      Alert.alert(
        'Download Complete',
        `${subdivision.Subdivision_Name} data has been downloaded for offline use.`
      );
    } catch (error) {
      console.error('Error downloading subdivision:', error);
      Alert.alert('Error', 'Failed to download subdivision data');
    } finally {
      setDownloading(false);
      setDownloadProgress(0);
    }
  };

  const deleteDownload = async (download) => {
    Alert.alert(
      'Delete Download',
      `Remove ${download.subdivisionName} from offline storage?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete file
              await FileSystem.deleteAsync(download.fileUri, { idempotent: true });

              // Update downloads list
              const updatedDownloads = downloads.filter(d => d.subdivisionId !== download.subdivisionId);
              setDownloads(updatedDownloads);
              await AsyncStorage.setItem('offline_downloads', JSON.stringify(updatedDownloads));

              await calculateStorage();

              Alert.alert('Success', 'Download removed');
            } catch (error) {
              console.error('Error deleting download:', error);
              Alert.alert('Error', 'Failed to delete download');
            }
          },
        },
      ]
    );
  };

  const isDownloaded = (subdivisionId) => {
    return downloads.some(d => d.subdivisionId === subdivisionId);
  };

  const getDownloadInfo = (subdivisionId) => {
    return downloads.find(d => d.subdivisionId === subdivisionId);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.background} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Offline Maps</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Storage Info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Storage</Text>
          <View style={styles.storageBar}>
            <View style={[styles.storageUsed, { width: `${(storageInfo.used / storageInfo.available) * 100}%` }]} />
          </View>
          <Text style={styles.storageText}>
            {storageInfo.used.toFixed(1)} MB used of {storageInfo.available.toFixed(0)} MB available
          </Text>
        </View>

        {/* Downloaded Subdivisions */}
        {downloads.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Downloaded ({downloads.length})</Text>
            {downloads.map((download) => (
              <View key={download.subdivisionId} style={styles.downloadItem}>
                <View style={styles.downloadInfo}>
                  <Ionicons name="checkmark-circle" size={24} color={theme.colors.authorityActive} />
                  <View style={styles.downloadDetails}>
                    <Text style={styles.downloadName}>{download.subdivisionName}</Text>
                    <Text style={styles.downloadMeta}>
                      {download.mileposts} mileposts • {(download.size / (1024 * 1024)).toFixed(1)} MB
                    </Text>
                    <Text style={styles.downloadDate}>
                      Downloaded {new Date(download.downloadDate).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => deleteDownload(download)}
                  style={styles.deleteButton}
                >
                  <Ionicons name="trash" size={20} color={theme.colors.error} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Available Downloads */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Available Subdivisions</Text>
          
          {Array.isArray(subdivisions) && subdivisions.length === 0 ? (
            <Text style={styles.emptyText}>No subdivisions available</Text>
          ) : (
            (Array.isArray(subdivisions) ? subdivisions : []).map((subdivision) => {
              const downloaded = isDownloaded(subdivision.Subdivision_ID);
              const downloadInfo = getDownloadInfo(subdivision.Subdivision_ID);
              
              return (
                <View key={subdivision.Subdivision_ID} style={styles.subdivisionItem}>
                  <View style={styles.subdivisionInfo}>
                    <Ionicons 
                      name={downloaded ? "cloud-done" : "cloud-download"} 
                      size={24} 
                      color={downloaded ? theme.colors.authorityActive : theme.colors.accent} 
                    />
                    <View style={styles.subdivisionDetails}>
                      <Text style={styles.subdivisionName}>{subdivision.Subdivision_Name}</Text>
                      {downloaded && downloadInfo && (
                        <Text style={styles.subdivisionMeta}>
                          {downloadInfo.mileposts} mileposts • {(downloadInfo.size / (1024 * 1024)).toFixed(1)} MB
                        </Text>
                      )}
                    </View>
                  </View>
                  
                  {!downloaded && (
                    <TouchableOpacity
                      onPress={() => downloadSubdivision(subdivision)}
                      style={styles.downloadButton}
                      disabled={Boolean(downloading)}
                    >
                      {downloading ? (
                        <ActivityIndicator size="small" color={theme.colors.textPrimary} />
                      ) : (
                        <>
                          <Ionicons name="download" size={20} color={theme.colors.textPrimary} />
                          <Text style={styles.downloadButtonText}>Download</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
        </View>

        {/* Download Progress */}
        {downloading && (
          <View style={styles.progressCard}>
            <Text style={styles.progressText}>Downloading...</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressBarFill, { width: `${Math.round(downloadProgress * 100)}%` }]} />
            </View>
            <Text style={styles.progressPercent}>{Math.round(downloadProgress * 100)}%</Text>
          </View>
        )}

        {/* Info */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={24} color={theme.colors.accent} />
          <Text style={styles.infoText}>
            Downloaded maps can be used offline for navigation and pin dropping. 
            Data is synced automatically when you're back online.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    backgroundColor: theme.colors.textPrimary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 40,
    paddingBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.accent,
  },
  backButton: {
    padding: theme.spacing.sm,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.background,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: theme.spacing.md,
  },
  card: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadows.medium,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  storageBar: {
    height: 8,
    backgroundColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    overflow: 'hidden',
    marginBottom: theme.spacing.sm,
  },
  storageUsed: {
    height: '100%',
    backgroundColor: theme.colors.accent,
  },
  storageText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  downloadItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  downloadInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  downloadDetails: {
    flex: 1,
    marginLeft: theme.spacing.sm,
  },
  downloadName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  downloadMeta: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  downloadDate: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  deleteButton: {
    padding: theme.spacing.sm,
  },
  subdivisionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  subdivisionInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  subdivisionDetails: {
    flex: 1,
    marginLeft: theme.spacing.sm,
  },
  subdivisionName: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.textPrimary,
  },
  subdivisionMeta: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
  },
  downloadButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginLeft: theme.spacing.xs,
  },
  emptyText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    padding: theme.spacing.lg,
  },
  progressCard: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadows.medium,
  },
  progressText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  progressPercent: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
    textAlign: 'center',
  },
  progressBar: {
    height: 8,
    backgroundColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: theme.colors.accent,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.accent,
    marginBottom: theme.spacing.xl,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.sm,
    lineHeight: 20,
  },
});

export default OfflineDownloadScreen;
