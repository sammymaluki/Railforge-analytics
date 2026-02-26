import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import DropDownPicker from 'react-native-dropdown-picker';
import { 
  COLORS, 
  SPACING, 
  FONT_SIZES, 
  FONT_WEIGHTS, 
  BORDER_RADIUS,
  SHADOWS 
} from '../../constants/theme';
import { getCurrentTrack, interpolateMilepost } from '../../utils/trackGeometry';
import { addPin, updatePin } from '../../store/slices/pinSlice';
import { CONFIG } from '../../constants/config';
import apiService from '../../services/api/ApiService';
import permissionManager from '../../utils/permissionManager';
import logger from '../../utils/logger';
import { resolveMediaUri } from '../../utils/media';

const getAgencyIdFromUser = (user) => {
  if (!user) return null;

  const rawAgencyId =
    user.Agency_ID ??
    user.agency_id ??
    user.agencyId ??
    user.AgencyId ??
    user.agency?.Agency_ID ??
    user.agency?.agency_id ??
    user.agency?.agencyId ??
    user.Agency?.Agency_ID ??
    user.Agency?.agency_id ??
    user.Agency?.agencyId;

  const agencyId = Number(rawAgencyId);
  return Number.isFinite(agencyId) ? agencyId : null;
};

const getImagePickerMediaType = () => {
  if (ImagePicker.MediaTypeOptions?.Images) {
    return ImagePicker.MediaTypeOptions.Images;
  }
  if (ImagePicker.MediaType?.Images) {
    return ImagePicker.MediaType.Images;
  }
  return ['images'];
};

const normalizePhotoAsset = (asset) => {
  if (!asset?.uri) return null;

  // Keep a stable preview URI for iOS while preserving the local file URI for upload.
  const previewUri = asset.base64
    ? `data:image/jpeg;base64,${asset.base64}`
    : asset.uri;

  return {
    uri: previewUri,
    uploadUri: asset.uri,
    mimeType: asset.mimeType || 'image/jpeg',
    fileName: asset.fileName || `pin_${Date.now()}.jpg`,
    metadata: {
      capturedAt: new Date().toISOString(),
      gpsAccuracyAtCapture: null
    }
  };
};

const extractPinPhotos = (pin) => {
  if (!pin) return [];

  const parsedUrls = (() => {
    const source = pin.Photo_URLs || pin.photoUrls;
    if (!source) return [];
    if (Array.isArray(source)) return source;
    if (typeof source !== 'string') return [];
    try {
      const parsed = JSON.parse(source);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  })();

  const fallbackUrl = pin.photoUri || pin.Photo_URL || pin.photoUrl || pin.photo_url;
  const urls = parsedUrls.length > 0 ? parsedUrls : (fallbackUrl ? [fallbackUrl] : []);

  return urls
    .map((url) => resolveMediaUri(url))
    .filter(Boolean)
    .map((uri) => ({ uri, uploadUri: uri, metadata: null }));
};

const PinDropScreen = ({ navigation, route }) => {
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const { currentAuthority } = useSelector((state) => state.authority);
  const editingPin = route.params?.pin || null;
  const isEditing = Boolean(editingPin);
  
  const [pinCategories, setPinCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(true);
  
  // Auto-captured data
  const [location, setLocation] = useState(null);
  const [track, setTrack] = useState(null);
  const [milepost, setMilepost] = useState(null);
  const [timestamp] = useState(new Date().toISOString());
  const selectedPinType = pinCategories.find((category) => String(category.Pin_Type_ID) === String(selectedCategory));

  useEffect(() => {
    if (user?.token) {
      fetchPinCategories();
    }
    if (!isEditing) {
      getCurrentLocation();
    }
  }, [user?.token]);

  useEffect(() => {
    if (!editingPin) {
      return;
    }

    setSelectedCategory(
      String(
        editingPin.pinTypeId ||
        editingPin.Pin_Type_ID ||
        ''
      )
    );
    setNotes(editingPin.notes || editingPin.Notes || '');

    setPhotos(extractPinPhotos(editingPin));

    const lat = editingPin.latitude ?? editingPin.Latitude;
    const lng = editingPin.longitude ?? editingPin.Longitude;
    if (lat != null && lng != null) {
      setLocation({
        latitude: Number(lat),
        longitude: Number(lng),
        accuracy: editingPin.accuracy ?? editingPin.Accuracy ?? null
      });
      setLoadingLocation(false);
    }

    const trackType = editingPin.trackType ?? editingPin.Track_Type;
    const trackNumber = editingPin.trackNumber ?? editingPin.Track_Number;
    if (trackType || trackNumber) {
      setTrack({
        type: trackType || null,
        number: trackNumber || null,
      });
    }

    const mp = editingPin.milepost ?? editingPin.MP;
    if (mp != null && mp !== '') {
      setMilepost(Number(mp));
    }
  }, [editingPin]);

  const fetchPinCategories = async () => {
    try {
      const agencyId = getAgencyIdFromUser(user);
      if (!agencyId) {
        logger.warn('Pins', 'No agency ID found on user payload; cannot fetch pin categories');
        setPinCategories([]);
        return;
      }

      logger.info('Pins', 'Fetching pin types for agency:', agencyId);
      const response = await apiService.api.get(
        `/config/agencies/${agencyId}/pin-types`
      );
      
      logger.info('Pins', 'Pin types API response:', response.data);
      
      // Handle multiple backend response shapes
      const responseData = response?.data;
      const data = Array.isArray(responseData?.data?.pinTypes)
        ? responseData.data.pinTypes
        : Array.isArray(responseData?.pinTypes)
          ? responseData.pinTypes
          : Array.isArray(responseData?.data)
            ? responseData.data
            : Array.isArray(responseData)
              ? responseData
              : [];
      
      logger.info('Pins', 'Extracted pin types data:', data);
      
      if (data.length > 0) {
        // Map to format expected by UI: combine category and subtype as display name
        const formattedData = data.map(pt => ({
          Pin_Type_ID: pt.Pin_Type_ID ?? pt.pinTypeId ?? pt.pin_type_id,
          Type_Name: pt.Type_Name || pt.typeName || `${pt.Pin_Category || pt.category || 'General'} - ${pt.Pin_Subtype || pt.subtype || 'General'}`,
          Pin_Category: pt.Pin_Category ?? pt.category ?? 'General',
          Pin_Subtype: pt.Pin_Subtype ?? pt.subtype ?? 'General',
          Color: pt.Color ?? pt.color ?? '#FF7A00',
          Photos_Enabled: pt.Photos_Enabled ?? pt.photosEnabled ?? true,
          Photo_Required: pt.Photo_Required ?? pt.photoRequired ?? false,
          Max_Photos: pt.Max_Photos ?? pt.maxPhotos ?? 1,
          Max_Photo_Size_MB: pt.Max_Photo_Size_MB ?? pt.maxPhotoSizeMb ?? 10,
          Photo_Compression_Quality: pt.Photo_Compression_Quality ?? pt.photoCompressionQuality ?? 80
        }))
        .filter((pt) => Number.isFinite(Number(pt.Pin_Type_ID)));

        logger.info('Pins', 'Formatted pin categories:', formattedData);
        setPinCategories(formattedData);
      } else {
        logger.warn('Pins', 'No pin types returned from API');
        setPinCategories([]);
      }
    } catch (error) {
      logger.error('Pins', 'Error fetching pin categories:', error);
      // Keep empty array if API fails - user must have valid categories
      setPinCategories([]);
    }
  };

  const getCurrentLocation = async () => {
    try {
      setLoadingLocation(true);
      
      const granted = await permissionManager.requestLocationPermission(false);
      if (!granted) {
        Alert.alert('Permission Denied', 'Location permission is required to drop pins');
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      setLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy ?? null
      });

      // Get track and milepost if we have subdivision data
      if (currentAuthority && route.params?.mileposts) {
        const trackInfo = getCurrentTrack(
          position.coords.latitude,
          position.coords.longitude,
          route.params.mileposts
        );

        if (trackInfo) {
          setTrack({
            type: trackInfo.trackType,
            number: trackInfo.trackNumber,
          });
          setMilepost(trackInfo.milepost);
        }
      }
    } catch (error) {
      logger.error('Pins', 'Error getting location:', error);
      Alert.alert('Error', 'Failed to get current location');
    } finally {
      setLoadingLocation(false);
    }
  };

  const takePhoto = async () => {
    try {
      const granted = await permissionManager.requestCameraPermission();
      if (!granted) {
        Alert.alert('Permission Denied', 'Camera permission is required');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: getImagePickerMediaType(),
        allowsEditing: Platform.OS !== 'ios',
        aspect: [4, 3],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets?.[0]) {
        const normalized = normalizePhotoAsset(result.assets[0]);
        if (normalized) {
          const maxPhotos = Number(selectedPinType?.Max_Photos || 1);
          if (photos.length >= maxPhotos) {
            Alert.alert('Photo Limit Reached', `This category allows up to ${maxPhotos} photo(s).`);
            return;
          }
          normalized.metadata.gpsAccuracyAtCapture = location?.accuracy ?? null;
          setPhotos((currentPhotos) => [...currentPhotos, normalized]);
        }
      }
    } catch (error) {
      logger.error('Pins', 'Camera launch failed', error);
      Alert.alert('Camera Error', 'Unable to open camera. Please try again.');
    }
  };

  const pickPhoto = async () => {
    try {
      const granted = await permissionManager.requestPhotoLibraryPermission();
      if (!granted) {
        Alert.alert('Permission Denied', 'Photo library permission is required');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: getImagePickerMediaType(),
        allowsEditing: Platform.OS !== 'ios',
        aspect: [4, 3],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets?.[0]) {
        const normalized = normalizePhotoAsset(result.assets[0]);
        if (normalized) {
          const maxPhotos = Number(selectedPinType?.Max_Photos || 1);
          if (photos.length >= maxPhotos) {
            Alert.alert('Photo Limit Reached', `This category allows up to ${maxPhotos} photo(s).`);
            return;
          }
          normalized.metadata.gpsAccuracyAtCapture = location?.accuracy ?? null;
          setPhotos((currentPhotos) => [...currentPhotos, normalized]);
        }
      }
    } catch (error) {
      logger.error('Pins', 'Photo picker launch failed', error);
      Alert.alert('Photo Library Error', 'Unable to open photo library. Please try again.');
    }
  };

  const handleSavePin = async () => {
    if (!selectedCategory) {
      Alert.alert('Validation Error', 'Please select a pin category');
      return;
    }

    if (!location) {
      Alert.alert('Error', 'Location not available. Please try again.');
      return;
    }
    if (selectedPinType?.Photos_Enabled === false && photos.length > 0) {
      Alert.alert('Validation Error', 'Photos are disabled for the selected category');
      return;
    }
    if (selectedPinType?.Photo_Required && photos.length === 0) {
      Alert.alert('Validation Error', 'At least one photo is required for the selected category');
      return;
    }
    if (photos.length > Number(selectedPinType?.Max_Photos || 1)) {
      Alert.alert('Validation Error', `This category allows up to ${selectedPinType?.Max_Photos || 1} photos`);
      return;
    }

    const agencyId = getAgencyIdFromUser(user);
    if (!agencyId) {
      Alert.alert('Error', 'Unable to determine your agency. Please log in again.');
      return;
    }

    let pinData = null;

    try {
      setLoading(true);

      pinData = {
        userId: user.User_ID,
        agencyId,
        authorityId: currentAuthority?.Authority_ID || null,
        pinTypeId: parseInt(selectedCategory),
        latitude: location.latitude,
        longitude: location.longitude,
        trackType: track?.type || null,
        trackNumber: track?.number || null,
        mp: milepost || null,
        notes: notes || null,
        photoUrl: null,
        photos: [],
        timestamp: timestamp,
      };

      logger.info('Pins', 'About to save pin with data:', pinData);
      logger.info('Pins', 'Selected category ID:', selectedCategory);
      logger.info('Pins', 'Available categories:', pinCategories);

      for (const item of photos) {
        const uploadSourceUri = item?.uploadUri || item?.uri || null;
        const isLocalUploadUri = Boolean(
          uploadSourceUri &&
          (uploadSourceUri.startsWith('file:') || uploadSourceUri.startsWith('content:'))
        );

        let resolvedUrl = item?.uri || null;

        if (isLocalUploadUri) {
          const formData = new FormData();
          formData.append('photo', {
            uri: uploadSourceUri,
            type: item.mimeType || 'image/jpeg',
            name: item.fileName || `pin_${Date.now()}.jpg`,
          });

          if (currentAuthority?.Authority_ID) {
            formData.append('authorityId', currentAuthority.Authority_ID.toString());
          }
          formData.append('pinTypeId', String(parseInt(selectedCategory, 10)));

          const uploadData = await apiService.uploadPinPhoto(formData);
          resolvedUrl = uploadData?.data?.url || uploadData?.url || resolvedUrl;
        }

        if (resolvedUrl) {
          pinData.photos.push({
            url: resolvedUrl,
            metadata: item.metadata || {
              capturedAt: new Date().toISOString(),
              gpsAccuracyAtCapture: location?.accuracy ?? null
            }
          });
        }
      }
      pinData.photoUrl = pinData.photos[0]?.url || null;

      // Save pin to backend
      const pinId = editingPin?.id || editingPin?.Pin_ID;
      const savedPin = isEditing
        ? await apiService.updatePin(pinId, pinData)
        : await apiService.createPin(pinData);

      // Add to Redux state with proper field mapping
      const pinToSave = savedPin.data || savedPin;
      const resolvedPhotoUri = resolveMediaUri(
        pinToSave.Photo_URL ||
        pinToSave.photo_url ||
        pinToSave.photoUrl ||
        pinData.photoUrl
      );
      const savedPhotos = extractPinPhotos({
        ...pinToSave,
        Photo_URL: pinToSave.Photo_URL || pinData.photoUrl,
        Photo_URLs: pinToSave.Photo_URLs || JSON.stringify(pinData.photos.map((photoItem) => photoItem.url))
      });
      const mappedPin = {
        id: pinToSave.Pin_ID || pinToSave.pinId || pinId || `temp_${Date.now()}`,
        pinTypeId: pinToSave.Pin_Type_ID || pinToSave.pinTypeId || parseInt(selectedCategory, 10),
        category: selectedCategory ? pinCategories.find(c => c.Pin_Type_ID === parseInt(selectedCategory))?.Type_Name : 'Unknown',
        latitude: pinToSave.Latitude ?? pinToSave.latitude ?? location.latitude,
        longitude: pinToSave.Longitude ?? pinToSave.longitude ?? location.longitude,
        trackType: pinToSave.Track_Type ?? pinToSave.trackType ?? track?.type ?? null,
        trackNumber: pinToSave.Track_Number ?? pinToSave.trackNumber ?? track?.number ?? null,
        milepost: pinToSave.MP ?? pinToSave.mp ?? milepost ?? null,
        notes: pinToSave.Notes ?? pinToSave.notes ?? notes ?? null,
        photoUri: resolvedPhotoUri,
        photos: savedPhotos,
        timestamp: pinToSave.Created_Date || pinToSave.createdDate || timestamp,
        syncPending: false
      };

      if (isEditing) {
        dispatch(updatePin(mappedPin));
      } else {
        dispatch(addPin(mappedPin));
      }

      Alert.alert(
        isEditing ? 'Pin Updated' : 'Pin Dropped',
        isEditing ? 'Pin has been updated successfully' : 'Pin has been saved successfully',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      logger.error('Pins', 'Error saving pin:', error);
      Alert.alert('Error', 'Failed to save pin. It will be synced when connection is restored.');
      
      // Save locally for offline sync with proper field mapping
      const fallbackPin = {
        id: `temp_${Date.now()}`,
        pinTypeId: selectedCategory ? parseInt(selectedCategory) : null,
        category: selectedCategory ? pinCategories.find(c => c.Pin_Type_ID === parseInt(selectedCategory))?.Type_Name : 'Unknown',
        latitude: location.latitude,
        longitude: location.longitude,
        trackType: track?.type,
        trackNumber: track?.number,
        milepost: milepost,
        notes: notes,
        photoUri: photos[0]?.uri || null,
        photos,
        timestamp: timestamp,
        syncPending: true,
        _pendingData: pinData // Keep original data for sync
      };

      if (isEditing && editingPin?.id) {
        dispatch(updatePin({ ...fallbackPin, id: editingPin.id }));
      } else {
        dispatch(addPin(fallbackPin));
      }
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  if (loadingLocation) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={styles.loadingText}>Getting location...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.secondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Drop Pin</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Category Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Category *</Text>
          <DropDownPicker
            open={categoryOpen}
            value={selectedCategory}
            items={(pinCategories || []).map((category) => ({
              label: category.Type_Name,
              value: category.Pin_Type_ID.toString(),
            }))}
            setOpen={setCategoryOpen}
            setValue={(callback) => {
              const nextValue = callback(selectedCategory);
              setSelectedCategory(nextValue);
            }}
            setItems={() => {}}
            placeholder="Select Category"
            style={styles.dropdown}
            dropDownContainerStyle={styles.dropdownContainer}
            textStyle={styles.dropdownText}
            listMode="SCROLLVIEW"
            zIndex={3000}
            zIndexInverse={1000}
          />
          {pinCategories.length === 0 && (
            <TouchableOpacity onPress={fetchPinCategories} style={styles.retryCategoriesButton}>
              <Text style={styles.retryCategoriesText}>No categories available. Tap to retry.</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Photo Capture */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Photos {selectedPinType?.Photo_Required ? '(Required)' : '(Optional)'}
          </Text>
          <View style={styles.photoContainer}>
            {selectedPinType?.Photos_Enabled === false ? (
              <Text style={styles.infoValue}>Photos are disabled for this category.</Text>
            ) : (
              <>
                <View style={styles.photoButtons}>
                  <TouchableOpacity style={styles.photoButton} onPress={takePhoto}>
                    <Ionicons name="camera" size={32} color={COLORS.accent} />
                    <Text style={styles.photoButtonText}>Take Photo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.photoButton} onPress={pickPhoto}>
                    <Ionicons name="images" size={32} color={COLORS.accent} />
                    <Text style={styles.photoButtonText}>Choose Photo</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.infoValue}>
                  {photos.length}/{Number(selectedPinType?.Max_Photos || 1)} selected
                </Text>
                {photos.map((item, index) => (
                  <View key={`${item.uri}_${index}`} style={styles.photoPreview}>
                    <Image source={{ uri: item.uri }} style={styles.photoImage} />
                    <TouchableOpacity
                      style={styles.removePhotoButton}
                      onPress={() => setPhotos((currentPhotos) => currentPhotos.filter((_, photoIndex) => photoIndex !== index))}
                    >
                      <Ionicons name="close-circle" size={32} color={COLORS.error} />
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            )}
          </View>
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes (Optional)</Text>
          <TextInput
            style={styles.notesInput}
            placeholder="Add notes about this location..."
            placeholderTextColor={COLORS.textSecondary}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Auto-Captured Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Captured Information</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Ionicons name="location" size={20} color={COLORS.accent} />
              <Text style={styles.infoLabel}>GPS:</Text>
              <Text style={styles.infoValue}>
                {location ? `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}` : 'Not available'}
              </Text>
            </View>

            {track && (
              <View style={styles.infoRow}>
                <Ionicons name="train" size={20} color={COLORS.accent} />
                <Text style={styles.infoLabel}>Track:</Text>
                <Text style={styles.infoValue}>
                  {track.type} {track.number}
                </Text>
              </View>
            )}

            {milepost && (
              <View style={styles.infoRow}>
                <Ionicons name="flag" size={20} color={COLORS.accent} />
                <Text style={styles.infoLabel}>Milepost:</Text>
                <Text style={styles.infoValue}>MP {milepost.toFixed(2)}</Text>
              </View>
            )}

            <View style={styles.infoRow}>
              <Ionicons name="time" size={20} color={COLORS.accent} />
              <Text style={styles.infoLabel}>Time:</Text>
              <Text style={styles.infoValue}>
                {new Date(timestamp).toLocaleString()}
              </Text>
            </View>
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, loading && styles.saveButtonDisabled]}
          onPress={handleSavePin}
          disabled={Boolean(loading)}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.primary} />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={24} color={COLORS.primary} />
              <Text style={styles.saveButtonText}>{isEditing ? 'Update Pin' : 'Drop Pin'}</Text>
            </>
          )}
        </TouchableOpacity>
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
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: SPACING.md,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  dropdown: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.sm,
    minHeight: 50,
  },
  dropdownContainer: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
  },
  dropdownText: {
    color: COLORS.text,
  },
  retryCategoriesButton: {
    marginTop: SPACING.sm,
  },
  retryCategoriesText: {
    color: COLORS.accent,
    fontSize: FONT_SIZES.sm,
    textDecorationLine: 'underline',
  },
  photoContainer: {
    minHeight: 200,
  },
  photoButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  photoButton: {
    flex: 1,
    alignItems: 'center',
    padding: SPACING.xl,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    marginHorizontal: SPACING.sm,
  },
  photoButtonText: {
    marginTop: SPACING.sm,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.text,
  },
  photoPreview: {
    position: 'relative',
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    marginTop: SPACING.sm,
  },
  photoImage: {
    width: '100%',
    height: 300,
    borderRadius: BORDER_RADIUS.md,
  },
  removePhotoButton: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.round,
  },
  notesInput: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    minHeight: 100,
  },
  infoCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  infoLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.text,
    marginLeft: SPACING.sm,
    marginRight: SPACING.sm,
  },
  infoValue: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.md,
    marginBottom: SPACING.xl,
    ...SHADOWS.md,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.primary,
    marginLeft: SPACING.sm,
  },
});

export default PinDropScreen;

