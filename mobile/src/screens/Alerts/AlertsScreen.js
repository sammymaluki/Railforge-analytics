import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchAlerts, markAlertAsRead, deleteAlert } from '../../store/slices/alertSlice';
import theme from '../../constants/theme';
import apiService from '../../services/api/ApiService';

const AlertsScreen = () => {
  const dispatch = useDispatch();
  const { alerts, unreadAlertsCount, loading } = useSelector((state) => state.alerts);
  const { user } = useSelector((state) => state.auth);
  const agencyId = user?.Agency_ID ?? user?.agency_id ?? user?.agencyId;
  const [filter, setFilter] = useState('All');
  const [refreshing, setRefreshing] = useState(false);
  const [alertConfigs, setAlertConfigs] = useState([]);

  const filters = ['All', 'Unread', 'Critical', 'Warning', 'Info'];

  useEffect(() => {
    loadAlerts();
    loadAlertConfigurations();
  }, []);

  const loadAlerts = async () => {
    try {
      await dispatch(fetchAlerts()).unwrap();
    } catch (error) {
      Alert.alert('Error', 'Failed to load alerts');
    }
  };

  const loadAlertConfigurations = async () => {
    if (!agencyId) {
      return;
    }
    try {
      const response = await apiService.getAlertConfigurations(agencyId);
      setAlertConfigs(response?.data?.configurations || []);
    } catch (error) {
      setAlertConfigs([]);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAlerts();
    setRefreshing(false);
  };

  const handleMarkAsRead = async (alertId) => {
    try {
      await dispatch(markAlertAsRead(alertId)).unwrap();
    } catch (error) {
      Alert.alert('Error', 'Failed to mark alert as read');
    }
  };

  const handleDeleteAlert = (alertId) => {
    Alert.alert(
      'Delete Alert',
      'Are you sure you want to delete this alert?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await dispatch(deleteAlert(alertId)).unwrap();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete alert');
            }
          },
        },
      ]
    );
  };

  const getFilteredAlerts = () => {
    if (!alerts) return [];
    
    switch (filter) {
      case 'Unread':
        return alerts.filter(alert => !alert.isRead);
      case 'Critical':
        return alerts.filter(alert => alert.severity === 'Critical');
      case 'Warning':
        return alerts.filter(alert => alert.severity === 'Warning');
      case 'Info':
        return alerts.filter(alert => alert.severity === 'Info');
      default:
        return alerts;
    }
  };

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'Critical':
        return 'alert-octagon';
      case 'Warning':
        return 'alert';
      case 'Info':
        return 'information';
      default:
        return 'bell';
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'Critical':
        return theme.colors.error;
      case 'Warning':
        return theme.colors.warning;
      case 'Info':
        return '#2196F3';
      default:
        return theme.colors.textSecondary;
    }
  };

  const renderAlert = ({ item }) => (
    <TouchableOpacity
      style={[styles.alertCard, !item.isRead && styles.alertCardUnread]}
      onPress={() => !item.isRead && handleMarkAsRead(item.id)}
    >
      <View style={styles.alertHeader}>
        <View style={styles.severityBadge}>
          <MaterialCommunityIcons
            name={getSeverityIcon(item.severity)}
            size={20}
            color={getSeverityColor(item.severity)}
          />
          <Text style={[styles.severityText, { color: getSeverityColor(item.severity) }]}>
            {item.severity || 'Alert'}
          </Text>
        </View>
        <TouchableOpacity onPress={() => handleDeleteAlert(item.id)}>
          <MaterialCommunityIcons name="close" size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <Text style={styles.alertTitle}>{item.title || 'Alert Notification'}</Text>
      
      {item.message && (
        <Text style={styles.alertMessage}>{item.message}</Text>
      )}

      <View style={styles.alertFooter}>
        <View style={styles.alertMeta}>
          <MaterialCommunityIcons name="clock-outline" size={14} color={theme.colors.textSecondary} />
          <Text style={styles.alertTime}>
            {item.timestamp ? new Date(item.timestamp).toLocaleString() : 'Just now'}
          </Text>
        </View>
        
        {!item.isRead && (
          <View style={styles.unreadBadge}>
            <View style={styles.unreadDot} />
            <Text style={styles.unreadText}>New</Text>
          </View>
        )}
      </View>

      {item.location && (
        <View style={styles.locationInfo}>
          <MaterialCommunityIcons name="map-marker" size={14} color={theme.colors.accent} />
          <Text style={styles.locationText}>
            {item.location.trackType} {item.location.trackNumber} - MP {item.location.milepost}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <MaterialCommunityIcons name="bell-off" size={80} color={theme.colors.textSecondary} />
      <Text style={styles.emptyTitle}>No Alerts</Text>
      <Text style={styles.emptyText}>
        {filter === 'All'
          ? 'You have no alerts at this time.'
          : `No ${filter.toLowerCase()} alerts.`}
      </Text>
    </View>
  );

  const filteredAlerts = getFilteredAlerts();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Alerts</Text>
        {unreadAlertsCount > 0 && (
          <View style={styles.unreadCountBadge}>
            <Text style={styles.unreadCountText}>{unreadAlertsCount}</Text>
          </View>
        )}
      </View>

      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.filterContainer}
        contentContainerStyle={styles.filterContent}
      >
        {filters.map((item) => (
          <TouchableOpacity
            key={item}
            style={[
              styles.filterChip,
              filter === item && styles.filterChipActive,
            ]}
            onPress={() => setFilter(item)}
          >
            <Text
              style={[
                styles.filterChipText,
                filter === item && styles.filterChipTextActive,
              ]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {item}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {alertConfigs.length > 0 && (
        <View style={styles.configCard}>
          <Text style={styles.configTitle}>System Alert Settings</Text>
          {alertConfigs.slice(0, 6).map((cfg) => (
            <Text key={cfg.Config_ID} style={styles.configText}>
              {cfg.Config_Type} {cfg.Alert_Level}: {cfg.Distance_Miles} mi
            </Text>
          ))}
        </View>
      )}

      <FlatList
        data={filteredAlerts}
        keyExtractor={(item, index) => item.id?.toString() || `alert-${index}`}
        renderItem={renderAlert}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.accent}
            colors={[theme.colors.accent]}
          />
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  configCard: {
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(255, 209, 0, 0.08)',
    padding: theme.spacing.md,
  },
  configTitle: {
    color: theme.colors.accent,
    fontWeight: '700',
    marginBottom: theme.spacing.xs,
    fontSize: 13,
  },
  configText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
  },
  unreadCountBadge: {
    backgroundColor: theme.colors.error,
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  unreadCountText: {
    color: theme.colors.background,
    fontSize: 12,
    fontWeight: 'bold',
  },
  filterContainer: {
    backgroundColor: theme.colors.cardBackground,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  filterContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  filterChip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  filterChipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  filterChipText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: theme.colors.textPrimary,
    fontWeight: 'bold',
  },
  listContainer: {
    padding: theme.spacing.lg,
  },
  alertCard: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadows.medium,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.border,
  },
  alertCardUnread: {
    borderLeftColor: theme.colors.accent,
    backgroundColor: 'rgba(255, 209, 0, 0.05)',
  },
  alertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  severityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  severityText: {
    marginLeft: theme.spacing.xs,
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  alertMessage: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: theme.spacing.sm,
  },
  alertFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  alertMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  alertTime: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginLeft: 4,
  },
  unreadBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.accent,
    marginRight: 4,
  },
  unreadText: {
    fontSize: 12,
    color: theme.colors.accent,
    fontWeight: '600',
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  locationText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginLeft: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
    paddingHorizontal: theme.spacing.xl,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  emptyText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
});

export default AlertsScreen;
