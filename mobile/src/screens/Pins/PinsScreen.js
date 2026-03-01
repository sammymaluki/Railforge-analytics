import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  Linking,
  Share,
} from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { deletePin, fetchPins } from '../../store/slices/pinSlice';
import { getActiveAuthority } from '../../store/slices/authoritySlice';
import theme from '../../constants/theme';
import { resolveMediaUri } from '../../utils/media';

const PinsScreen = () => {
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const { pins, loading } = useSelector((state) => state.pins);
  const { currentAuthority } = useSelector((state) => state.authority);
  const { user } = useSelector((state) => state.auth);
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Fetch pins when screen is focused
  useFocusEffect(
    React.useCallback(() => {
      if (!currentAuthority?.Authority_ID && user?.token) {
        dispatch(getActiveAuthority());
      }

      if (currentAuthority?.Authority_ID) {
        dispatch(fetchPins(currentAuthority.Authority_ID));
      }
    }, [currentAuthority?.Authority_ID, user?.token, dispatch])
  );

  const categories = [
    'All',
    ...Array.from(new Set((pins || []).map((pin) => pin.category).filter(Boolean))),
  ];

  const filteredPins = selectedCategory === 'All' 
    ? pins 
    : pins.filter(pin => pin.category === selectedCategory);

  const handleDeletePin = (pinId) => {
    Alert.alert(
      'Delete Pin',
      'Are you sure you want to delete this pin?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            dispatch(deletePin(pinId));
          },
        },
      ]
    );
  };

  const handleDropNewPin = () => {
    navigation.navigate('PinForm');
  };

  const handleEmailPinList = async () => {
    if (!filteredPins.length) {
      Alert.alert('No Pins', 'There are no pins to email in this view.');
      return;
    }

    const timestamp = new Date().toLocaleString();
    const listText = filteredPins
      .map((pin, index) => {
        const lat = Number(pin.latitude);
        const lng = Number(pin.longitude);
        const coords = Number.isFinite(lat) && Number.isFinite(lng)
          ? `${lat.toFixed(6)}, ${lng.toFixed(6)}`
          : 'Unknown';
        const mp = pin.milepost != null && pin.milepost !== '' ? `MP ${pin.milepost}` : 'MP N/A';
        const track = [pin.trackType, pin.trackNumber].filter(Boolean).join(' ') || 'Track N/A';
        const note = pin.notes ? ` | Notes: ${pin.notes}` : '';
        const photoLinks = Array.isArray(pin.photos) ? pin.photos.map((photo) => photo?.uri).filter(Boolean) : [];
        const photos = photoLinks.length > 0 ? ` | Photos: ${photoLinks.join(', ')}` : '';
        return `${index + 1}. ${pin.category || 'Uncategorized'} | ${track} | ${mp} | ${coords}${note}${photos}`;
      })
      .join('\n');

    const subject = `RailForge Analytics Pin Drops (${filteredPins.length})`;
    const body = `Pin Drop List\nGenerated: ${timestamp}\nFilter: ${selectedCategory}\n\n${listText}`;
    const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    try {
      const canOpenMail = await Linking.canOpenURL(mailtoUrl);
      if (canOpenMail) {
        await Linking.openURL(mailtoUrl);
        return;
      }

      await Share.share({
        title: subject,
        message: `${subject}\n\n${body}`,
      });
    } catch (error) {
      Alert.alert('Share Failed', 'Unable to open email or share options on this device.');
    }
  };

  const handleEditPin = (pin) => {
    navigation.navigate('PinForm', { pin });
  };

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'Scrap-Rail':
        return 'train-car-flatbed';
      case 'Scrap-Ties':
        return 'pine-tree';
      case 'Monitor Location':
        return 'eye';
      case 'Defect':
        return 'alert-circle';
      case 'Obstruction':
        return 'alert-octagon';
      default:
        return 'map-marker';
    }
  };

  const getCategoryColor = (category) => {
    switch (category) {
      case 'Scrap-Rail':
        return '#2196F3';
      case 'Scrap-Ties':
        return '#4CAF50';
      case 'Monitor Location':
        return '#FF9800';
      case 'Defect':
        return '#F44336';
      case 'Obstruction':
        return '#9C27B0';
      default:
        return theme.colors.accent;
    }
  };

  const renderPin = ({ item }) => {
    const photoFromArray = Array.isArray(item.photos) && item.photos.length > 0
      ? item.photos[0]?.uri
      : null;
    const photoUri = resolveMediaUri(
      photoFromArray ||
      item.photoUri ||
      item.Photo_URL ||
      item.photoUrl ||
      item.photo_url
    );

    return (
    <TouchableOpacity style={styles.pinCard} onPress={() => handleEditPin(item)} activeOpacity={0.9}>
      <View style={styles.pinHeader}>
        <View style={styles.categoryBadge}>
          <MaterialCommunityIcons 
            name={getCategoryIcon(item.category)} 
            size={20} 
            color={getCategoryColor(item.category)} 
          />
          <Text style={[styles.categoryText, { color: getCategoryColor(item.category) }]}>
            {item.category}
          </Text>
        </View>
        <View style={styles.pinActions}>
          <TouchableOpacity onPress={() => handleEditPin(item)}>
            <MaterialCommunityIcons name="pencil" size={20} color={theme.colors.accent} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDeletePin(item.id)}>
            <MaterialCommunityIcons name="delete" size={24} color={theme.colors.error} />
          </TouchableOpacity>
        </View>
      </View>

      {photoUri && (
        <Image source={{ uri: photoUri }} style={styles.pinImage} />
      )}

      {item.notes && (
        <Text style={styles.pinNotes}>{item.notes}</Text>
      )}

      <View style={styles.pinDetails}>
        <View style={styles.detailRow}>
          <MaterialCommunityIcons name="map-marker" size={16} color={theme.colors.textSecondary} />
          <Text style={styles.detailText}>
            {item.latitude?.toFixed(6)}, {item.longitude?.toFixed(6)}
          </Text>
        </View>

        {item.trackType && item.trackNumber && (
          <View style={styles.detailRow}>
            <MaterialCommunityIcons name="train-car-autorack" size={16} color={theme.colors.textSecondary} />
            <Text style={styles.detailText}>
              {item.trackType} {item.trackNumber}
            </Text>
          </View>
        )}

        {item.milepost && (
          <View style={styles.detailRow}>
            <MaterialCommunityIcons name="map-marker-distance" size={16} color={theme.colors.textSecondary} />
            <Text style={styles.detailText}>
              MP {item.milepost}
            </Text>
          </View>
        )}

        <View style={styles.detailRow}>
          <MaterialCommunityIcons name="clock-outline" size={16} color={theme.colors.textSecondary} />
          <Text style={styles.detailText}>
            {new Date(item.timestamp).toLocaleString()}
          </Text>
        </View>

        {item.syncPending && (
          <View style={styles.syncPendingBadge}>
            <MaterialCommunityIcons name="sync" size={14} color={theme.colors.warning} />
            <Text style={styles.syncPendingText}>Pending Sync</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <MaterialCommunityIcons name="map-marker-off" size={80} color={theme.colors.textSecondary} />
      <Text style={styles.emptyTitle}>No Pins Dropped</Text>
      <Text style={styles.emptyText}>
        {selectedCategory === 'All' 
          ? 'Drop your first pin to track locations and issues.'
          : `No pins in the ${selectedCategory} category.`}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Pin Drops ({filteredPins.length})</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.emailButton} onPress={handleEmailPinList}>
            <MaterialCommunityIcons name="email-outline" size={26} color={theme.colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.addButton} onPress={handleDropNewPin}>
            <MaterialCommunityIcons name="plus" size={24} color={theme.colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.filterContainer}
        contentContainerStyle={styles.filterContent}
      >
        {categories.map((item) => (
          <TouchableOpacity
            key={item}
            style={[
              styles.filterChip,
              selectedCategory === item && styles.filterChipActive,
            ]}
            onPress={() => setSelectedCategory(item)}
          >
            <Text
              style={[
                styles.filterChipText,
                selectedCategory === item && styles.filterChipTextActive,
              ]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {item}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
          <Text style={styles.loadingText}>Loading pins...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredPins}
          keyExtractor={(item) => item.id}
          renderItem={renderPin}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={renderEmptyState}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  emailButton: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(59, 130, 246, 0.6)',
  },
  addButton: {
    backgroundColor: theme.colors.accent,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.medium,
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
  pinCard: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadows.medium,
  },
  pinHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  pinActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  categoryText: {
    marginLeft: theme.spacing.xs,
    fontSize: 14,
    fontWeight: 'bold',
  },
  pinImage: {
    width: '100%',
    height: 200,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.sm,
    backgroundColor: theme.colors.border,
  },
  pinNotes: {
    fontSize: 15,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
    lineHeight: 22,
  },
  pinDetails: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  detailText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.xs,
  },
  syncPendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.xs,
  },
  syncPendingText: {
    fontSize: 12,
    color: theme.colors.warning,
    marginLeft: 4,
    fontWeight: '600',
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  loadingText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
  },
});

export default PinsScreen;
