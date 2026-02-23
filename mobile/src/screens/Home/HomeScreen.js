import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, ActivityIndicator, TextInput } from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '../../constants/theme';
import gpsTrackingService from '../../services/gps/GPSTrackingService';
import apiService from '../../services/api/ApiService';
import { setLayerVisibility } from '../../store/slices/mapSlice';
import { getMapStyleById } from '../../constants/mapStyles';

// Dark map style
const customMapStyle = [
  {
    "elementType": "geometry",
    "stylers": [{ "color": "#242f3e" }]
  },
  {
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#746855" }]
  },
  {
    "elementType": "labels.text.stroke",
    "stylers": [{ "color": "#242f3e" }]
  },
  {
    "featureType": "road",
    "elementType": "geometry",
    "stylers": [{ "color": "#38414e" }]
  },
  {
    "featureType": "road",
    "elementType": "geometry.stroke",
    "stylers": [{ "color": "#212a37" }]
  },
  {
    "featureType": "water",
    "elementType": "geometry",
    "stylers": [{ "color": "#17263c" }]
  }
];

const HomeScreen = ({ navigation }) => {
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const { unreadAlertsCount } = useSelector((state) => state.alerts);
  const storedLayerVisibility = useSelector((state) => state.map.layerVisibility || {});
  const mapStyleId = useSelector((state) => state.map.mapStyleId);
  const authority = useSelector((state) => state.authority);
  const pin = useSelector((state) => state.pin);
  const gps = useSelector((state) => state.gps);
  
  const activeAuthority = authority?.activeAuthority;
  const authorities = authority?.authorities || [];
  const pins = pin?.pins || [];
  const currentPosition = gps?.currentPosition;
  const isTracking = gps?.isTracking;

  const [gpsActive, setGpsActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [layersVisible, setLayersVisible] = useState(false);
  const [layersLoading, setLayersLoading] = useState(false);
  const [layers, setLayers] = useState([]);
  const [layerVisibility, setLocalLayerVisibility] = useState({});
  const [layerData, setLayerData] = useState({});
  const [mapRegion, setMapRegion] = useState({
    latitude: currentPosition?.latitude || 39.8283,
    longitude: currentPosition?.longitude || -98.5795,
    latitudeDelta: 50,
    longitudeDelta: 50,
  });

  useEffect(() => {
    setGpsActive(isTracking);
  }, [isTracking]);

  useEffect(() => {
    if (currentPosition) {
      setMapRegion({
        latitude: currentPosition.latitude,
        longitude: currentPosition.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      });
    }
  }, [currentPosition]);

  // Memoize active authorities count
  const activeAuthoritiesCount = useMemo(() => {
    return authorities.filter(auth => 
      auth.Status === 'Active' || auth.Status === 'active'
    ).length;
  }, [authorities]);

  // Memoize nearby infrastructure count
  const nearbyInfrastructureCount = useMemo(() => {
    if (!currentPosition) return 0;
    return pins.filter(pin => {
      // Simple distance check - within ~0.01 degrees (~1km)
      const latDiff = Math.abs(pin.Latitude - currentPosition.latitude);
      const lonDiff = Math.abs(pin.Longitude - currentPosition.longitude);
      return latDiff < 0.01 && lonDiff < 0.01;
    }).length;
  }, [pins, currentPosition]);

  const quickActions = [
    {
      id: 'map',
      title: 'Track Map',
      icon: 'map-marker',
      color: '#FFD100',
      onPress: () => navigation.navigate('Map'),
    },
    {
      id: 'authority',
      title: 'Enter Authority',
      icon: 'clipboard-check',
      color: '#FFD100',
      onPress: () => navigation.navigate('Authority'),
    },
    {
      id: 'pins',
      title: 'Pin Drops',
      icon: 'map-marker-multiple',
      color: '#FFD100',
      onPress: () => navigation.navigate('Pins'),
    },
    {
      id: 'alerts',
      title: 'Alerts',
      icon: 'bell',
      color: '#FF3B30',
      badge: unreadAlertsCount,
      onPress: () => navigation.navigate('Alerts'),
    },
  ];

  const handleGPSToggle = async (value) => {
    if (value) {
      try {
        await gpsTrackingService.init();
        await gpsTrackingService.startTracking(activeAuthority || null);
        setGpsActive(true);
      } catch (error) {
        console.error('Failed to enable GPS tracking:', error);
      }
    } else {
      await gpsTrackingService.stopTracking();
      setGpsActive(false);
    }
  };

  const loadLayers = async () => {
    if (layersLoading) return;
    setLayersLoading(true);
    try {
      const data = await apiService.getMapLayers({
        subdivisionId: activeAuthority?.Subdivision_ID || undefined,
      });
      const list = data?.layers || [];
      setLayers(list);
      const hasStored = Object.keys(storedLayerVisibility).length > 0;
      const visibility = {};
      list.forEach((layer) => {
        const defaultValue = hasStored ? Boolean(storedLayerVisibility[layer.id]) : layer.count > 0;
        visibility[layer.id] = defaultValue;
        if (!hasStored) {
          dispatch(setLayerVisibility({ layerId: layer.id, value: defaultValue }));
        }
      });
      setLocalLayerVisibility(visibility);

      const visibleLayerIds = list
        .filter((layer) => visibility[layer.id])
        .map((layer) => layer.id);

      const missingLayerIds = visibleLayerIds
        .filter((layerId) => !layerData[layerId]);

      // Fetch sequentially to avoid overloading backend/DB when many layers are enabled.
      for (const layerId of missingLayerIds) {
        // eslint-disable-next-line no-await-in-loop
        await loadLayerData(layerId);
      }
    } catch (error) {
      console.error('Failed to load map layers:', error);
    } finally {
      setLayersLoading(false);
    }
  };

  const loadLayerData = async (layerId) => {
    try {
      const data = await apiService.getMapLayerData(layerId, {
        subdivisionId: activeAuthority?.Subdivision_ID || undefined,
        limit: 1000,
      });
      setLayerData((prev) => ({
        ...prev,
        [layerId]: data?.features || [],
      }));
    } catch (error) {
      console.error(`Failed to load layer data for ${layerId}:`, error);
    }
  };

  const toggleLayer = async (layerId) => {
    const nextValue = !layerVisibility[layerId];
    setLocalLayerVisibility((prev) => ({
      ...prev,
      [layerId]: nextValue,
    }));
    dispatch(setLayerVisibility({ layerId, value: nextValue }));

    if (!layerData[layerId]) {
      await loadLayerData(layerId);
    }
  };

  const getLayerStyle = (layer) => {
    if (layer.id === 'mileposts') {
      return { color: '#FFD100', icon: 'numeric-9-plus-box' };
    }
    if (layer.id === 'tracks') {
      return { color: '#00C2FF', icon: 'train-variant' };
    }
    if (layer.id === 'signals') return { color: '#4CD964', icon: 'signal-variant' };
    if (layer.id === 'road-crossings') return { color: '#FF9500', icon: 'road-variant' };
    if (layer.id === 'rail-crossings') return { color: '#FF9500', icon: 'transit-connection-variant' };
    if (layer.id === 'bridges') return { color: '#5AC8FA', icon: 'bridge' };
    if (layer.id === 'tunnels') return { color: '#AF52DE', icon: 'tunnel' };
    if (layer.id === 'stations') return { color: '#34C759', icon: 'train' };
    if (layer.id === 'turnouts') return { color: '#FFD60A', icon: 'swap-horizontal' };
    if (layer.id === 'detectors') return { color: '#FF453A', icon: 'radar' };
    if (layer.id === 'derails') return { color: '#FF453A', icon: 'alert' };
    if (layer.id === 'snowsheds') return { color: '#64D2FF', icon: 'weather-snowy' };
    if (layer.id === 'arches') return { color: '#FFD60A', icon: 'arch' };
    if (layer.id === 'culverts') return { color: '#30B0C7', icon: 'pipe' };
    if (layer.id === 'depots') return { color: '#34C759', icon: 'warehouse' };
    if (layer.id === 'control-points') return { color: '#FF9F0A', icon: 'crosshairs-gps' };
    return { color: '#FF7A00', icon: 'map-marker-radius' };
  };

  const activeMarkers = useMemo(() => {
    const markers = [];
    layers.forEach((layer) => {
      if (!layerVisibility[layer.id]) return;
      const features = layerData[layer.id] || [];
      const style = getLayerStyle(layer);
      features.forEach((feature, index) => {
        if (feature.Latitude == null || feature.Longitude == null) return;
        markers.push({
          key: `${layer.id}-${feature.Track_ID || feature.Milepost_ID || index}`,
          latitude: Number(feature.Latitude),
          longitude: Number(feature.Longitude),
          title: feature.Asset_Name || layer.label,
          description: feature.MP ? `MP ${feature.MP}` : feature.Asset_Type || layer.label,
          color: style.color,
          icon: style.icon,
        });
      });
    });
    return markers;
  }, [layers, layerData, layerVisibility]);

  const selectedStyle = getMapStyleById(mapStyleId);

  return (
    <View style={styles.container}>
      {/* Background Map */}
      <MapView
        style={styles.backgroundMap}
        provider={PROVIDER_GOOGLE}
        mapType={selectedStyle.mapType}
        customMapStyle={selectedStyle.customStyle || customMapStyle}
        region={mapRegion}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsCompass={false}
        scrollEnabled={!layersVisible}
        zoomEnabled={!layersVisible}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        {activeMarkers.map((marker) => (
          <Marker
            key={marker.key}
            coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
            title={marker.title}
            description={marker.description}
            pinColor={marker.color}
            tracksViewChanges={false}
          >
            <View style={[styles.layerMarker, { borderColor: marker.color }]}>
              <MaterialCommunityIcons name={marker.icon} size={16} color={marker.color} />
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Search Bar */}
      <View style={styles.searchBar}>
        <MaterialCommunityIcons name="magnify" size={18} color="#999999" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search for stations, tracks, mileposts..."
          placeholderTextColor="#999999"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onFocus={() => navigation.navigate('Search', { initialQuery: searchQuery })}
          onSubmitEditing={() => navigation.navigate('Search', { initialQuery: searchQuery })}
          returnKeyType="search"
        />
      </View>

      {/* Layers Toggle Button */}
      <TouchableOpacity
        style={styles.layersButton}
        onPress={() => {
          const nextVisible = !layersVisible;
          setLayersVisible(nextVisible);
          if (nextVisible && layers.length === 0) {
            loadLayers();
          }
        }}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons
          name={layersVisible ? 'close' : 'layers'}
          size={24}
          color="#FFFFFF"
        />
      </TouchableOpacity>

      {layersVisible && (
        <View style={styles.layersPanel}>
          <View style={styles.layersHeader}>
            <Text style={styles.layersTitle}>Layers</Text>
            {layersLoading && <ActivityIndicator size="small" color="#FFD100" />}
          </View>
          <Text style={styles.layersHint}>
            Toggle layers ON to search or navigate to those features.
          </Text>
          <ScrollView style={styles.layersList} showsVerticalScrollIndicator={false}>
            {layers.map((layer) => (
              <View key={layer.id} style={styles.layerRow}>
                <View style={styles.layerInfo}>
                  <MaterialCommunityIcons
                    name={getLayerStyle(layer).icon}
                    size={18}
                    color={getLayerStyle(layer).color}
                  />
                  <Text style={styles.layerLabel}>{layer.label}</Text>
                  <Text style={styles.layerCount}>{layer.count}</Text>
                </View>
                <Switch
                  value={Boolean(layerVisibility[layer.id])}
                  onValueChange={() => toggleLayer(layer.id)}
                  trackColor={{ false: '#333333', true: '#FFD100' }}
                  thumbColor="#FFFFFF"
                />
              </View>
            ))}
            {layers.length === 0 && !layersLoading && (
              <Text style={styles.layerEmpty}>No layers available.</Text>
            )}
          </ScrollView>
          <Text style={styles.layersDisclaimer}>
            Turn OFF layers you don't need to improve performance.
          </Text>
        </View>
      )}

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  backgroundMap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  searchBar: {
    position: 'absolute',
    top: 20,
    left: 20,
    zIndex: 1000,
    right: 76,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  searchInput: {
    flex: 1,
    color: '#000000',
    fontSize: 13,
  },
  layersButton: {
    position: 'absolute',
    top: 20,
    left: undefined,
    right: 20,
    zIndex: 1000,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  layersPanel: {
    position: 'absolute',
    top: 72,
    left: 20,
    width: 260,
    maxHeight: 360,
    backgroundColor: 'rgba(18, 18, 18, 0.96)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#333333',
    zIndex: 999,
  },
  layersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  layersTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  layersHint: {
    fontSize: 11,
    color: '#CCCCCC',
    marginBottom: 8,
  },
  layersList: {
    maxHeight: 240,
  },
  layerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
  },
  layerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  layerLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    flex: 1,
  },
  layerCount: {
    color: '#FFD100',
    fontSize: 12,
    marginLeft: 6,
  },
  layerEmpty: {
    color: '#999999',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 16,
  },
  layersDisclaimer: {
    marginTop: 8,
    fontSize: 10,
    color: '#A0A0A0',
  },
  layerMarker: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
  },
  menuOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  header: {
    backgroundColor: 'transparent',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  scrollContent: {
    flex: 1,
  },
  welcomeSection: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  title: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#999999',
  },
  section: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  sectionHeader: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  actionButton: {
    width: '50%',
    paddingHorizontal: 6,
    marginBottom: 12,
  },
  actionIconWrapper: {
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    height: 120,
    position: 'relative',
    borderLeftWidth: 4,
    borderLeftColor: '#FFD100',
  },
  actionBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  actionBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 8,
  },
  summaryCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryIconWrapper: {
    marginBottom: 12,
  },
  summaryValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 13,
    color: '#999999',
    textAlign: 'center',
    lineHeight: 18,
  },
  summaryDivider: {
    width: 1,
    height: 80,
    backgroundColor: '#2C2C2E',
    marginHorizontal: 16,
  },
});

export default HomeScreen;
