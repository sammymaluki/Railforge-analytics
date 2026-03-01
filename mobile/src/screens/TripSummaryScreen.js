import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  StyleSheet, 
  TouchableOpacity, 
  Alert, 
  TextInput,
  ActivityIndicator,
  ScrollView,
  Linking
} from 'react-native';
import { useSelector } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';
import databaseService from '../services/database/DatabaseService';
import apiService from '../services/api/ApiService';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { CONFIG } from '../constants/config';

export default function TripSummaryScreen({ route, navigation }) {
  const { authorityId } = route.params || {};
  const { user } = useSelector((state) => state.auth);
  
  const [pins, setPins] = useState([]);
  const [gpsLogs, setGpsLogs] = useState([]);
  const [authority, setAuthority] = useState(null);
  const [email, setEmail] = useState(user?.Email || '');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    loadTripData();
  }, [authorityId]);

  const loadTripData = async () => {
    try {
      if (!authorityId) return;
      
      // Load from local database first
      const p = await databaseService.getAuthorityPins(authorityId);
      setPins(p || []);

      // Get GPS logs
      const allLogs = await databaseService.getPendingGPSLogs(1000);
      const filtered = allLogs.filter(
        l => String(l.authority_id) === String(authorityId) || l.authority_id === authorityId
      );
      setGpsLogs(filtered || []);

      // Try to fetch full report from API if online
      try {
        const response = await apiService.api.get(`/trip-reports/${authorityId}`);
        if (response.data) {
          setAuthority(response.data.authority);
          setPins(response.data.pins || p || []);
        }
      } catch (error) {
        console.log('Could not fetch from API, using local data');
      }
    } catch (error) {
      console.error('Error loading trip data:', error);
    }
  };

  const handleEmailReport = async () => {
    if (!email || !email.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address');
      return;
    }

    try {
      setLoading(true);
      const response = await apiService.api.post('/trip-reports/email', {
        authorityId,
        email,
        includeGPSLogs: true,
      });

      if (response.data.success) {
        setEmailSent(true);
        Alert.alert(
          'Success', 
          `Trip report sent to ${email}`,
          [{ text: 'OK', onPress: () => setEmailSent(false) }]
        );
      }
    } catch (error) {
      console.error('Email report error:', error);
      Alert.alert('Error', 'Failed to send email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      setLoading(true);
      const pdfUrl = `${CONFIG.API.BASE_URL}/trip-reports/${authorityId}/pdf`;
      
      Alert.alert(
        'Download PDF',
        'Open PDF in browser?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open',
            onPress: async () => {
              const url = `${pdfUrl}?token=${user?.token}`;
              const supported = await Linking.canOpenURL(url);
              if (supported) {
                await Linking.openURL(url);
              } else {
                Alert.alert('Error', 'Cannot open PDF viewer');
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error('PDF download error:', error);
      Alert.alert('Error', 'Failed to generate PDF');
    } finally {
      setLoading(false);
    }
  };

  const renderPinItem = ({ item }) => (
    <View style={styles.pinItem}>
      <View style={styles.pinHeader}>
        <View style={[styles.pinColorDot, { backgroundColor: item.Color || '#FFD100' }]} />
        <Text style={styles.pinTitle}>
          {item.Pin_Category || item.pin_category || 'Pin'} - {item.Pin_Subtype || item.pin_subtype || ''}
        </Text>
      </View>
      {item.Notes && <Text style={styles.pinNotes}>{item.Notes}</Text>}
      <View style={styles.pinDetails}>
        <Text style={styles.pinDetail}>
          <Ionicons name="location" size={18} color={COLORS.accent} />
          {' '}MP {item.MP || item.mp || '--'} • {item.Track_Type} {item.Track_Number}
        </Text>
        <Text style={styles.pinDetail}>
          <Ionicons name="time" size={18} color={COLORS.accent} />
          {' '}{new Date(item.Created_At || item.created_at).toLocaleString()}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Trip Summary</Text>
        </View>

        {/* Authority Summary */}
        {authority && (
          <View style={styles.summaryCard}>
            <Text style={styles.cardTitle}>Authority Details</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subdivision:</Text>
              <Text style={styles.summaryValue}>{authority.Subdivision_Name}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Track:</Text>
              <Text style={styles.summaryValue}>
                {authority.Track_Type} {authority.Track_Number}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Authority:</Text>
              <Text style={styles.summaryValue}>
                MP {authority.Begin_MP} - {authority.End_MP}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Duration:</Text>
              <Text style={styles.summaryValue}>
                {new Date(authority.Created_At).toLocaleString()}
                {authority.End_Time && ` - ${new Date(authority.End_Time).toLocaleString()}`}
              </Text>
            </View>
          </View>
        )}

        {/* Statistics */}
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{pins.length}</Text>
            <Text style={styles.statLabel}>Pin Drops</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{gpsLogs.length}</Text>
            <Text style={styles.statLabel}>GPS Logs</Text>
          </View>
        </View>

        {/* Email Section */}
        <View style={styles.exportCard}>
          <Text style={styles.cardTitle}>Export Options</Text>
          
          <View style={styles.emailInputContainer}>
            <Ionicons name="mail" size={24} color={COLORS.accent} style={styles.emailIcon} />
            <TextInput
              style={styles.emailInput}
              placeholder="Enter email address"
              placeholderTextColor={COLORS.textSecondary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.exportButtons}>
            <TouchableOpacity
              style={[styles.exportButton, styles.emailButton]}
              onPress={handleEmailReport}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="mail-outline" size={24} color="#FFFFFF" />
                  <Text style={styles.exportButtonText}>Email Report</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.exportButton, styles.pdfButton]}
              onPress={handleDownloadPDF}
              disabled={loading}
            >
              <Ionicons name="document-text-outline" size={20} color="#FFFFFF" />
              <Text style={styles.exportButtonText}>View PDF</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Pins List */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            <Ionicons name="location" size={18} color={COLORS.accent} /> Pin Drops
          </Text>
          {pins.length === 0 ? (
            <Text style={styles.emptyText}>No pins recorded</Text>
          ) : (
            <FlatList
              data={pins}
              keyExtractor={(item, index) => String(item.Pin_ID || item.pin_id || index)}
              renderItem={renderPinItem}
              scrollEnabled={false}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    padding: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  backButton: {
    marginRight: SPACING.md,
  },
  headerTitle: { 
    fontSize: FONT_SIZES.xxl, 
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.text,
  },
  summaryCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.md,
  },
  cardTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: SPACING.xs,
  },
  summaryLabel: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHTS.medium,
  },
  summaryValue: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    fontWeight: FONT_WEIGHTS.semiBold,
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.md,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: SPACING.md,
  },
  statValue: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.accent,
  },
  statLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  exportCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.md,
  },
  emailInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.sm,
    marginBottom: SPACING.md,
  },
  emailIcon: {
    marginRight: SPACING.sm,
  },
  emailInput: {
    flex: 1,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
  exportButtons: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  exportButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.sm,
    gap: SPACING.xs,
    ...SHADOWS.sm,
  },
  emailButton: {
    backgroundColor: COLORS.accent,
  },
  pdfButton: {
    backgroundColor: COLORS.error,
  },
  exportButtonText: {
    color: '#FFFFFF',
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semiBold,
  },
  sectionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.md,
  },
  sectionTitle: { 
    fontSize: FONT_SIZES.lg, 
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  emptyText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: SPACING.lg,
  },
  pinItem: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
  },
  pinHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  pinColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: SPACING.xs,
  },
  pinTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semiBold,
    color: COLORS.text,
  },
  pinNotes: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  pinDetails: {
    marginTop: SPACING.xs,
  },
  pinDetail: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xxs,
    lineHeight: 18,
  },
});
