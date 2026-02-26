import React, { useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, SectionList, ActivityIndicator, Platform, Alert } from 'react-native';
import { useSelector } from 'react-redux';
import { useRoute } from '@react-navigation/native';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import apiService from '../../services/api/ApiService';
import * as Clipboard from 'expo-clipboard';
import { Linking } from 'react-native';
import { getMapStyleById } from '../../constants/mapStyles';

// Dark map style to match app theme
const customMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#38414e' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212a37' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17263c' }] },
];

const SearchScreen = () => {
  const route = useRoute();
  const mapRef = useRef(null);
  const { currentPosition } = useSelector((state) => state.gps);
  const { activeAuthority } = useSelector((state) => state.authority);
  const layerVisibility = useSelector((state) => state.map.layerVisibility || {});
  const mapStyleId = useSelector((state) => state.map.mapStyleId);
  const [query, setQuery] = useState('');
  const [layers, setLayers] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedResult, setSelectedResult] = useState(null);
  const [expandedSections, setExpandedSections] = useState({});
  const [mapRegion, setMapRegion] = useState({
    latitude: currentPosition?.latitude || 39.8283,
    longitude: currentPosition?.longitude || -98.5795,
    latitudeDelta: 50,
    longitudeDelta: 50,
  });

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

  useEffect(() => {
    const initialQuery = route.params?.initialQuery;
    if (initialQuery && typeof initialQuery === 'string') {
      setQuery(initialQuery);
    }
  }, [route.params?.initialQuery]);

  useEffect(() => {
    const loadLayers = async () => {
      try {
        const data = await apiService.getMapLayers({
          subdivisionId: activeAuthority?.Subdivision_ID || undefined,
        });
        setLayers(data?.layers || []);
      } catch (error) {
        console.error('Failed to load search layers:', error);
      }
    };
    loadLayers();
  }, [activeAuthority?.Subdivision_ID]);

  useEffect(() => {
    const handler = setTimeout(async () => {
      const trimmed = query.trim();
      if (!trimmed) {
        setResults([]);
        return;
      }

      const hasStored = Object.keys(layerVisibility).length > 0;
      const activeLayerIds = layers
        .map((layer) => layer.id)
        .filter((layerId) =>
          hasStored ? layerVisibility[layerId] : (layers.find((l) => l.id === layerId)?.count || 0) > 0
        );

      if (activeLayerIds.length === 0) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
        const data = await apiService.searchMapLayers({
          q: trimmed,
          layers: activeLayerIds.join(','),
          subdivisionId: activeAuthority?.Subdivision_ID || undefined,
          limit: 200,
        });
        const grouped = (data?.results || []).map((group) => ({
          title: `${group.label} (${group.items.length} items)`,
          layerId: group.layerId,
          data: group.items,
        }));
        setResults(grouped);
        setExpandedSections((prev) => {
          const next = { ...prev };
          grouped.forEach((section) => {
            if (next[section.layerId] === undefined) {
              next[section.layerId] = true;
            }
          });
          return next;
        });
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [query, layers, layerVisibility, activeAuthority?.Subdivision_ID]);

  const handleSelectResult = (item, layerId) => {
    if (item?.Latitude && item?.Longitude && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: Number(item.Latitude),
          longitude: Number(item.Longitude),
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        500
      );
    }
    setSelectedResult({
      ...item,
      layerId,
    });
  };

  const toggleSection = (layerId) => {
    setExpandedSections((prev) => ({
      ...prev,
      [layerId]: !prev[layerId],
    }));
  };

  const openAppleMaps = (item) => {
    if (Platform.OS !== 'ios') {
      Alert.alert('Apple Maps', 'Apple Maps is only available on iOS.');
      return;
    }
    const label = encodeURIComponent(item.title || 'Selected Location');
    const url = `http://maps.apple.com/?ll=${item.Latitude},${item.Longitude}&q=${label}`;
    Linking.openURL(url);
  };

  const openGoogleMaps = async (item) => {
    const destination = `${item.Latitude},${item.Longitude}`;
    const origin = currentPosition
      ? `${currentPosition.latitude},${currentPosition.longitude}`
      : null;

    const label = encodeURIComponent(item.title || 'Selected Location');

    if (Platform.OS === 'android') {
      const navUrl = `google.navigation:q=${destination}`;
      const canOpen = await Linking.canOpenURL(navUrl);
      if (canOpen) {
        Linking.openURL(navUrl);
        return;
      }
    }

    if (Platform.OS === 'ios') {
      const navUrl = `comgooglemaps://?daddr=${destination}&directionsmode=driving`;
      const canOpen = await Linking.canOpenURL(navUrl);
      if (canOpen) {
        Linking.openURL(navUrl);
        return;
      }
    }

    const webUrl = origin
      ? `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`
      : `https://www.google.com/maps/search/?api=1&query=${destination}(${label})`;
    Linking.openURL(webUrl);
  };

  const copyToClipboard = async (item) => {
    const title = item.title || 'Location';
    const subtitle = item.subtitle ? `\n${item.subtitle}` : '';
    const coords = `\n${Number(item.Latitude).toFixed(6)}, ${Number(item.Longitude).toFixed(6)}`;
    await Clipboard.setStringAsync(`${title}${subtitle}${coords}`);
    Alert.alert('Copied', 'Location details copied to clipboard.');
  };

  const selectedStyle = getMapStyleById(mapStyleId);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.backgroundMap}
        provider={PROVIDER_GOOGLE}
        mapType={selectedStyle.mapType}
        customMapStyle={selectedStyle.customStyle || customMapStyle}
        region={mapRegion}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsCompass={false}
      />

      <View style={styles.searchPanel}>
        <View style={styles.searchInputWrapper}>
          <MaterialCommunityIcons name="magnify" size={18} color="#666666" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search for stations, tracks, subdivisions, etc."
            placeholderTextColor="#999999"
            value={query}
            onChangeText={setQuery}
          />
          {loading && <ActivityIndicator size="small" color="#FFD100" />}
        </View>

        <View style={styles.resultsHeader}>
          <Text style={styles.resultsTitle}>
            {query.trim() ? 'Search Results' : 'Recent Search Items'}
          </Text>
        </View>

        <SectionList
          sections={results}
          keyExtractor={(item, index) => `${item.id || index}`}
          renderSectionHeader={({ section }) => (
            <TouchableOpacity
              style={styles.sectionHeaderRow}
              onPress={() => toggleSection(section.layerId)}
            >
              <Text style={styles.sectionHeaderText}>{section.title}</Text>
              <MaterialCommunityIcons
                name={expandedSections[section.layerId] ? 'chevron-down' : 'chevron-right'}
                size={18}
                color="#FFD100"
              />
            </TouchableOpacity>
          )}
          renderItem={({ item, section }) => {
            if (!expandedSections[section.layerId]) return null;
            return (
              <TouchableOpacity
                style={styles.resultRow}
                onPress={() => handleSelectResult(item, section.layerId)}
              >
                <Text style={styles.resultTitle}>{item.title || 'Unknown'}</Text>
                <Text style={styles.resultSubtitle}>
                  {item.subtitle || `${item.Latitude}, ${item.Longitude}`}
                </Text>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {query.trim()
                ? 'No results found in active layers.'
                : 'Search for stations, tracks, mileposts, or assets.'}
            </Text>
          }
          stickySectionHeadersEnabled={false}
        />
        <Text style={styles.disclaimer}>
          Only layers toggled ON in the Layers menu are searched.
        </Text>
      </View>

      {selectedResult && (
        <View style={styles.detailPanel}>
          <TouchableOpacity style={styles.detailBack} onPress={() => setSelectedResult(null)}>
            <MaterialCommunityIcons name="arrow-left" size={18} color="#FFFFFF" />
            <Text style={styles.detailBackText}>Back</Text>
          </TouchableOpacity>

          <Text style={styles.detailTitle}>{selectedResult.title || 'Location'}</Text>
          {selectedResult.subtitle ? (
            <Text style={styles.detailSubtitle}>{selectedResult.subtitle}</Text>
          ) : null}
          <Text style={styles.detailCoords}>
            {Number(selectedResult.Latitude).toFixed(6)}, {Number(selectedResult.Longitude).toFixed(6)}
          </Text>

          <TouchableOpacity style={styles.actionButton} onPress={() => openAppleMaps(selectedResult)}>
            <Text style={styles.actionButtonText}>Send to Apple Maps</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => openGoogleMaps(selectedResult)}>
            <Text style={styles.actionButtonText}>Send to Google Maps</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => copyToClipboard(selectedResult)}>
            <Text style={styles.actionButtonText}>Copy to Clipboard</Text>
          </TouchableOpacity>
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
  searchPanel: {
    position: 'absolute',
    top: 120,
    left: 20,
    right: 20,
    maxHeight: '60%',
    backgroundColor: 'rgba(18, 18, 18, 0.96)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#333333',
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    color: '#000000',
    fontSize: 14,
  },
  resultsHeader: {
    marginTop: 12,
    marginBottom: 6,
  },
  resultsTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  emptyText: {
    color: '#999999',
    fontSize: 12,
    paddingVertical: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    marginTop: 8,
  },
  sectionHeaderText: {
    color: '#FFD100',
    fontSize: 12,
  },
  resultRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  resultTitle: {
    color: '#FFFFFF',
    fontSize: 13,
  },
  resultSubtitle: {
    color: '#999999',
    fontSize: 11,
    marginTop: 2,
  },
  disclaimer: {
    marginTop: 8,
    fontSize: 10,
    color: '#A0A0A0',
  },
  detailPanel: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 100,
    backgroundColor: 'rgba(18, 18, 18, 0.96)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#333333',
  },
  detailBack: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailBackText: {
    color: '#FFFFFF',
    fontSize: 12,
    marginLeft: 6,
  },
  detailTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  detailSubtitle: {
    color: '#CCCCCC',
    fontSize: 12,
    marginTop: 4,
  },
  detailCoords: {
    color: '#FFD100',
    fontSize: 12,
    marginTop: 6,
  },
  actionButton: {
    marginTop: 8,
    backgroundColor: '#FF8A00',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionButtonText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
});

export default SearchScreen;
