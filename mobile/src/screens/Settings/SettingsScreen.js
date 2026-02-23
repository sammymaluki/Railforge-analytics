import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logout } from '../../store/slices/authSlice';
import theme from '../../constants/theme';

const SettingsScreen = () => {
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [locationAlways, setLocationAlways] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await dispatch(logout()).unwrap();
              // Navigation will be handled by AppNavigator based on auth state
            } catch (error) {
              Alert.alert('Error', 'Failed to logout');
            }
          },
        },
      ]
    );
  };

  const handleClearCache = () => {
    Alert.alert(
      'Clear Cache',
      'This will remove all cached data. Offline maps will not be affected. Continue?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.removeItem('cachedData');
              Alert.alert('Success', 'Cache cleared successfully');
            } catch (error) {
              Alert.alert('Error', 'Failed to clear cache');
            }
          },
        },
      ]
    );
  };

  const handleOfflineMaps = () => {
    navigation.navigate('Offline');
  };

  const renderSection = (title) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );

  const renderSettingRow = (icon, title, subtitle, value, onValueChange, type = 'switch') => (
    <View style={styles.settingRow}>
      <View style={styles.settingLeft}>
        <MaterialCommunityIcons name={icon} size={24} color={theme.colors.accent} />
        <View style={styles.settingText}>
          <Text style={styles.settingTitle}>{title}</Text>
          {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      {type === 'switch' && (
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: '#333333', true: theme.colors.accent }}
          thumbColor={value ? theme.colors.background : '#f4f3f4'}
        />
      )}
      {type === 'arrow' && (
        <MaterialCommunityIcons name="chevron-right" size={24} color={theme.colors.textSecondary} />
      )}
    </View>
  );

  const renderActionRow = (icon, title, color, onPress) => (
    <TouchableOpacity style={styles.actionRow} onPress={onPress}>
      <MaterialCommunityIcons name={icon} size={24} color={color} />
      <Text style={[styles.actionTitle, { color }]}>{title}</Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container}>
      {/* User Profile Section */}
      <View style={styles.profileSection}>
        <View style={styles.avatarContainer}>
          <MaterialCommunityIcons name="account-circle" size={80} color={theme.colors.accent} />
        </View>
        <Text style={styles.userName}>{user?.name || 'User'}</Text>
        <Text style={styles.userEmail}>{user?.email || 'user@example.com'}</Text>
        {user?.role && (
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{user.role}</Text>
          </View>
        )}
      </View>

      {/* Notifications Section */}
      {renderSection('NOTIFICATIONS')}
      {renderSettingRow(
        'bell',
        'Push Notifications',
        'Receive alerts and updates',
        notificationsEnabled,
        setNotificationsEnabled
      )}
      {renderSettingRow(
        'volume-high',
        'Sound',
        'Alert sounds',
        soundEnabled,
        setSoundEnabled
      )}
      {renderSettingRow(
        'vibrate',
        'Vibration',
        'Haptic feedback for alerts',
        vibrationEnabled,
        setVibrationEnabled
      )}

      {/* Location Section */}
      {renderSection('LOCATION')}
      {renderSettingRow(
        'crosshairs-gps',
        'Background Location',
        'Allow location tracking while app is closed',
        locationAlways,
        setLocationAlways
      )}

      {/* Data & Offline Section */}
      {renderSection('DATA & OFFLINE')}
      {renderSettingRow(
        'cloud-off',
        'Offline Mode',
        'Use app without internet connection',
        offlineMode,
        setOfflineMode
      )}
      
      <TouchableOpacity style={styles.settingRow} onPress={handleOfflineMaps}>
        {renderSettingRow(
          'download',
          'Offline Maps',
          'Manage downloaded map data',
          null,
          null,
          'arrow'
        )}
      </TouchableOpacity>

      {/* App Info Section */}
      {renderSection('APP INFO')}
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>Version</Text>
        <Text style={styles.infoValue}>1.0.0</Text>
      </View>
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>Build</Text>
        <Text style={styles.infoValue}>2026.02.01</Text>
      </View>

      {/* Actions Section */}
      {renderSection('ACTIONS')}
      {renderActionRow('trash-can', 'Clear Cache', theme.colors.warning, handleClearCache)}
      {renderActionRow('logout', 'Logout', theme.colors.error, handleLogout)}

      <View style={styles.footer}>
        <Text style={styles.footerText}>Sidekick</Text>
        <Text style={styles.footerSubtext}>© RMedlin2026</Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
    backgroundColor: theme.colors.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  avatarContainer: {
    marginBottom: theme.spacing.md,
  },
  userName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  roleBadge: {
    backgroundColor: theme.colors.accent,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
    marginTop: theme.spacing.xs,
  },
  roleText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    textTransform: 'uppercase',
  },
  sectionHeader: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
    backgroundColor: theme.colors.background,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    letterSpacing: 0.5,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingText: {
    marginLeft: theme.spacing.md,
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  settingSubtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginLeft: theme.spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  infoLabel: {
    fontSize: 16,
    color: theme.colors.textPrimary,
  },
  infoValue: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
    paddingBottom: 40,
  },
  footerText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  footerSubtext: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
});

export default SettingsScreen;
