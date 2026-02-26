import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Share,
} from 'react-native';
import { useSelector } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { 
  COLORS, 
  SPACING, 
  FONT_SIZES, 
  FONT_WEIGHTS, 
  BORDER_RADIUS,
  SHADOWS 
} from '../../constants/theme';
import { CONFIG } from '../../constants/config';
  const { user } = useSelector((state) => state.auth);
  
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [tripData, setTripData] = useState(null);
  const [pins, setPins] = useState([]);

  useEffect(() => {
    loadTripData();
  }, []);

  const loadTripData = async () => {
    try {
      setLoading(true);

      // Fetch trip details
      const response = await fetch(
        `${CONFIG.API.BASE_URL}/authorities/${authorityId}`
      );
      const authority = await response.json();

      // Fetch pins for this trip
      const pinsResponse = await fetch(
        `${CONFIG.API.BASE_URL}/pins/authority/${authorityId}`
      );
      const pinsData = await pinsResponse.json();

      setTripData(authority);
      setPins(pinsData);
    } catch (error) {
      console.error('Error loading trip data:', error);
      Alert.alert('Error', 'Failed to load trip data');
    } finally {
      setLoading(false);
    }
  };

  const calculateDuration = () => {
    if (!tripData) return '--';
    
    const start = new Date(tripData.Start_Time);
    const end = tripData.End_Time ? new Date(tripData.End_Time) : new Date();
    
    const durationMs = end - start;
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${hours}h ${minutes}m`;
  };

  const calculateDistance = () => {
    if (!tripData) return '--';
    
    const begin = parseFloat(tripData.Begin_Milepost);
    const end = parseFloat(tripData.End_Milepost);
    
    return `${Math.abs(end - begin).toFixed(2)} mi`;
  };

  const exportToEmail = async () => {
    try {
      setExporting(true);

      const emailBody = generateEmailHTML();

      const response = await fetch(
        `${CONFIG.API.BASE_URL}/email/send-trip-summary`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.User_ID,
            authorityId: tripData.Authority_ID,
            emailBody,
            pins,
          }),
        }
      );

      if (!response.ok) throw new Error('Failed to send email');

      Alert.alert('Success', 'Trip summary has been sent to your email');
    } catch (error) {
      console.error('Error sending email:', error);
      Alert.alert('Error', 'Failed to send email');
    } finally {
      setExporting(false);
    }
  };

  const exportToPDF = async () => {
    try {
      setExporting(true);

      const response = await fetch(
        `${CONFIG.API.BASE_URL}/trip/generate/${authorityId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ format: 'pdf' }),
        }
      );

      if (!response.ok) throw new Error('Failed to generate PDF');

      const blob = await response.blob();
      const fileUri = `${FileSystem.documentDirectory}trip_${authorityId}.pdf`;

      // Save blob to file
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64data = reader.result.split(',')[1];
        await FileSystem.writeAsStringAsync(fileUri, base64data, {
          encoding: FileSystem.EncodingType.Base64,
        });

        // Share the file
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri);
        } else {
          Alert.alert('Success', `PDF saved to ${fileUri}`);
        }
      };
      reader.readAsDataURL(blob);
    } catch (error) {
      console.error('Error exporting to PDF:', error);
      Alert.alert('Error', 'Failed to export PDF');
    } finally {
      setExporting(false);
    }
  };

  const exportToExcel = async () => {
    try {
      setExporting(true);

      const response = await fetch(
        `${CONFIG.API.BASE_URL}/trip/generate/${authorityId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ format: 'excel' }),
        }
      );

      if (!response.ok) throw new Error('Failed to generate Excel');

      const blob = await response.blob();
      const fileUri = `${FileSystem.documentDirectory}trip_${authorityId}.xlsx`;

      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64data = reader.result.split(',')[1];
        await FileSystem.writeAsStringAsync(fileUri, base64data, {
          encoding: FileSystem.EncodingType.Base64,
        });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri);
        } else {
          Alert.alert('Success', `Excel file saved to ${fileUri}`);
        }
      };
      reader.readAsDataURL(blob);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      Alert.alert('Error', 'Failed to export Excel');
    } finally {
      setExporting(false);
    }
  };

  const shareText = async () => {
    try {
      const message = generateTextSummary();
      
      await Share.share({
        message,
        title: 'Trip Summary',
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const generateEmailHTML = () => {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { color: #000000; border-bottom: 3px solid #FFD100; padding-bottom: 10px; }
          .section { margin: 20px 0; }
          .label { font-weight: bold; color: #666; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th { background-color: #000000; color: #FFFFFF; padding: 10px; text-align: left; }
          td { padding: 10px; border-bottom: 1px solid #ddd; }
          .footer { margin-top: 30px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <h1>Trip Summary</h1>
        
        <div class="section">
          <p><span class="label">Employee:</span> ${tripData.Employee_Name}</p>
          <p><span class="label">Contact:</span> ${tripData.Employee_Contact}</p>
          <p><span class="label">Subdivision:</span> ${tripData.Subdivision_Name}</p>
          <p><span class="label">Track:</span> ${tripData.Track_Type} ${tripData.Track_Number}</p>
          <p><span class="label">Milepost Range:</span> MP ${tripData.Begin_Milepost} - ${tripData.End_Milepost}</p>
          <p><span class="label">Duration:</span> ${calculateDuration()}</p>
          <p><span class="label">Distance:</span> ${calculateDistance()}</p>
        </div>

        <div class="section">
          <h2>Pins Dropped (${pins.length})</h2>
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Location</th>
                <th>Milepost</th>
                <th>Notes</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              ${pins.map(pin => `
                <tr>
                  <td>${pin.Type_Name || 'Unknown'}</td>
                  <td>${pin.Latitude?.toFixed(6)}, ${pin.Longitude?.toFixed(6)}</td>
                  <td>${pin.Milepost ? `MP ${pin.Milepost.toFixed(2)}` : '--'}</td>
                  <td>${pin.Notes || '--'}</td>
                  <td>${new Date(pin.Created_Date).toLocaleString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="footer">
          <p>Generated by RailForge Analytics System</p>
          <p>${new Date().toLocaleString()}</p>
        </div>
      </body>
      </html>
    `;
  };

  const generateTextSummary = () => {
    return `
TRIP SUMMARY
============

Employee: ${tripData.Employee_Name}
Contact: ${tripData.Employee_Contact}
Subdivision: ${tripData.Subdivision_Name}
Track: ${tripData.Track_Type} ${tripData.Track_Number}
Milepost Range: MP ${tripData.Begin_Milepost} - ${tripData.End_Milepost}
Duration: ${calculateDuration()}
Distance: ${calculateDistance()}

PINS DROPPED: ${pins.length}
${pins.map((pin, index) => `
${index + 1}. ${pin.Type_Name || 'Unknown'}
   Location: ${pin.Latitude?.toFixed(6)}, ${pin.Longitude?.toFixed(6)}
   Milepost: ${pin.Milepost ? `MP ${pin.Milepost.toFixed(2)}` : '--'}
   Notes: ${pin.Notes || '--'}
   Time: ${new Date(pin.Created_Date).toLocaleString()}
`).join('')}

Generated: ${new Date().toLocaleString()}
    `.trim();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={styles.loadingText}>Loading trip summary...</Text>
      </View>
    );
  }

  if (!tripData) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={64} color={COLORS.error} />
        <Text style={styles.errorText}>Trip data not found</Text>
        <TouchableOpacity style={styles.button} onPress={() => navigation.goBack()}>
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.secondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trip Summary</Text>
        <TouchableOpacity onPress={shareText} style={styles.shareButton}>
          <Ionicons name="share-social" size={24} color={COLORS.secondary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Trip Details */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Trip Details</Text>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Employee:</Text>
            <Text style={styles.detailValue}>{tripData.Employee_Name}</Text>
          </View>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Contact:</Text>
            <Text style={styles.detailValue}>{tripData.Employee_Contact}</Text>
          </View>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Subdivision:</Text>
            <Text style={styles.detailValue}>{tripData.Subdivision_Name}</Text>
          </View>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Track:</Text>
            <Text style={styles.detailValue}>
              {tripData.Track_Type} {tripData.Track_Number}
            </Text>
          </View>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Milepost Range:</Text>
            <Text style={styles.detailValue}>
              MP {tripData.Begin_Milepost} - {tripData.End_Milepost}
            </Text>
          </View>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Duration:</Text>
            <Text style={styles.detailValue}>{calculateDuration()}</Text>
          </View>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Distance:</Text>
            <Text style={styles.detailValue}>{calculateDistance()}</Text>
          </View>
        </View>

        {/* Pins Summary */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Pins Dropped ({pins.length})</Text>
          
          {pins.length === 0 ? (
            <Text style={styles.emptyText}>No pins dropped during this trip</Text>
          ) : (
            pins.map((pin, index) => (
              <View key={pin.Pin_ID || index} style={styles.pinItem}>
                <View style={styles.pinHeader}>
                  <Ionicons name="location" size={20} color={COLORS.accent} />
                  <Text style={styles.pinCategory}>{pin.Type_Name || 'Unknown'}</Text>
                </View>
                
                {pin.Milepost && (
                  <Text style={styles.pinDetail}>MP {pin.Milepost.toFixed(2)}</Text>
                )}
                
                <Text style={styles.pinDetail}>
                  {pin.Latitude?.toFixed(6)}, {pin.Longitude?.toFixed(6)}
                </Text>
                
                {pin.Notes && (
                  <Text style={styles.pinNotes}>{pin.Notes}</Text>
                )}
                
                <Text style={styles.pinTime}>
                  {new Date(pin.Created_Date).toLocaleString()}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Export Options */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Export Options</Text>
          
          <TouchableOpacity
            style={[styles.exportButton, exporting && styles.exportButtonDisabled]}
            onPress={exportToEmail}
            disabled={Boolean(exporting)}
          >
            <Ionicons name="mail" size={24} color={COLORS.primary} />
            <Text style={styles.exportButtonText}>Send to Email</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.exportButton, exporting && styles.exportButtonDisabled]}
            onPress={exportToPDF}
            disabled={Boolean(exporting)}
          >
            <Ionicons name="document-text" size={24} color={COLORS.primary} />
            <Text style={styles.exportButtonText}>Export to PDF</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.exportButton, exporting && styles.exportButtonDisabled]}
            onPress={exportToExcel}
            disabled={Boolean(exporting)}
          >
            <Ionicons name="document" size={24} color={COLORS.primary} />
            <Text style={styles.exportButtonText}>Export to Excel</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: SPACING.xl,
  },
  errorText: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZES.lg,
    color: COLORS.textSecondary,
  },
  header: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 40,
    paddingBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.accent,
  },
  backButton: {
    padding: SPACING.sm,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.secondary,
  },
  shareButton: {
    padding: SPACING.sm,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: SPACING.md,
  },
  card: {
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
    marginBottom: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.accent,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  detailLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textSecondary,
  },
  detailValue: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    textAlign: 'right',
    flex: 1,
    marginLeft: SPACING.md,
  },
  emptyText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    padding: SPACING.lg,
  },
  pinItem: {
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
    paddingLeft: SPACING.md,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.md,
  },
  pinHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  pinCategory: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.text,
    marginLeft: SPACING.sm,
  },
  pinDetail: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  pinNotes: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontStyle: 'italic',
    marginVertical: SPACING.xs,
  },
  pinTime: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accent,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.sm,
    marginBottom: SPACING.sm,
  },
  exportButtonDisabled: {
    opacity: 0.5,
  },
  exportButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.primary,
    marginLeft: SPACING.md,
  },
});

export default TripSummaryScreen;

