import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Text,
  Alert,
  ActivityIndicator,
  Switch,
  Linking,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import DropDownPicker from 'react-native-dropdown-picker';
import { useSelector, useDispatch } from 'react-redux';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getActiveAuthority } from '../../store/slices/authoritySlice';
import { saveGPSLog } from '../../store/slices/gpsSlice';
import socketService from '../../services/socket/SocketService';
import apiService from '../../services/api/ApiService';
import gpsTrackingService from '../../services/gps/GPSTrackingService';
import MilepostDisplay from '../../components/map/MilepostDisplay';
import BoundaryIndicator from '../../components/map/BoundaryIndicator';
import OfflineIndicator from '../../components/common/OfflineIndicator';
import GPSAccuracyIndicator from '../../components/map/GPSAccuracyIndicator';
import {
  getCurrentTrack,
  checkAuthorityBoundaries,
  calculateBearing,
  interpolateMilepost
} from '../../utils/trackGeometry';
import { CONFIG } from '../../constants/config';
import { getMapStyleById } from '../../constants/mapStyles';
import permissionManager from '../../utils/permissionManager';
import logger from '../../utils/logger';
import { setLayerVisibility } from '../../store/slices/mapSlice';
import { useIsFocused } from '@react-navigation/native';
import { logout } from '../../store/slices/authSlice';
import { fetchPins } from '../../store/slices/pinSlice';
import * as Clipboard from 'expo-clipboard';
import { 
  COLORS, 
  SPACING, 
  FONT_SIZES, 
  FONT_WEIGHTS, 
  BORDER_RADIUS,
  ALERT_DISTANCES 
} from '../../constants/theme';

const { width, height } = Dimensions.get('window');
const RAILROAD_ADDRESS_REQUEST_INTERVAL_MS = 5000;
const MIN_MOVE_FOR_ADDRESS_REFRESH_METERS = 25;

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

const calculateDistanceMeters = (lat1, lng1, lat2, lng2) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Dark map style to match screenshots
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

const MapScreen = () => {
  const dispatch = useDispatch();
  const mapRef = useRef(null);
  const layerFetchTimeout = useRef(null);
  const layerFetchInProgress = useRef(false);
  const isMounted = useRef(true);
  const nearestAddressInFlight = useRef(false);
  const lastNearestAddressFetchAt = useRef(0);
  const lastNearestAddressCoords = useRef(null);
  const isFocused = useIsFocused();
  const HOME_POSITION_KEY = '@HerzogDB:map_home_position';
  
  const { user } = useSelector((state) => state.auth);
  const { currentAuthority } = useSelector((state) => state.authority);
  const pins = useSelector((state) => state.pins?.pins || []);
  const mapStyleId = useSelector((state) => state.map.mapStyleId);
  const storedLayerVisibility = useSelector((state) => state.map.layerVisibility || {});
  const { currentPosition, isTracking } = useSelector((state) => state.gps);
  
  const [region, setRegion] = useState({
    latitude: 39.8283,
    longitude: -98.5795,
    latitudeDelta: 50,
    longitudeDelta: 50,
  });
  
  const [followMode, setFollowMode] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [trackGeometry, setTrackGeometry] = useState([]);
  const [otherWorkers, setOtherWorkers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [gpsActive, setGpsActive] = useState(false);
  const [compassEnabled, setCompassEnabled] = useState(false);
  const [nearestRailroadAddress, setNearestRailroadAddress] = useState('None found');
  const [loadingRailroadAddress, setLoadingRailroadAddress] = useState(false);
  const [isGpsCardMinimized, setIsGpsCardMinimized] = useState(false);
  const [layers, setLayers] = useState([]);
  const [layersLoading, setLayersLoading] = useState(false);
  const [layerData, setLayerData] = useState({});
  const [layerVisibility, setLocalLayerVisibility] = useState({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [homePosition, setHomePosition] = useState(null);
  const [trackSearchVisible, setTrackSearchVisible] = useState(false);
  const [trackSearchLoading, setTrackSearchLoading] = useState(false);
  const [trackSearch, setTrackSearch] = useState({
    lineSegment: '',
    milepost: '',
    trackType: '',
    trackNumber: '',
  });
  const [trackSearchResult, setTrackSearchResult] = useState(null);
  const [trackSearchSubdivisions, setTrackSearchSubdivisions] = useState([]);
  const [trackSearchSubdivisionId, setTrackSearchSubdivisionId] = useState(null);
  const [trackSearchSubdivisionOpen, setTrackSearchSubdivisionOpen] = useState(false);
  
  // New Follow-Me mode state
  const [currentMilepost, setCurrentMilepost] = useState(null);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [distanceToBegin, setDistanceToBegin] = useState(null);
  const [distanceToEnd, setDistanceToEnd] = useState(null);
  const [heading, setHeading] = useState(0);
  const [speed, setSpeed] = useState(null);
  const [mileposts, setMileposts] = useState([]);
  const [subdivision, setSubdivision] = useState(null);
  const [withinBoundaries, setWithinBoundaries] = useState(true);
  const previousPosition = useRef(null);
  const hasLoadedAuthority = useRef(false);

  // Load active authority on mount
  useEffect(() => {
    // Only load authority if user is logged in
    if (!hasLoadedAuthority.current && user?.token) {
      hasLoadedAuthority.current = true;
      loadActiveAuthority();
    }
    
    // Reset flag if user logs out
    if (!user?.token) {
      hasLoadedAuthority.current = false;
    }
    
    // Setup socket listeners
    socketService.on('user_location_update', handleUserLocationUpdate);
    socketService.on('alert', handleAlert);
    
    return () => {
      socketService.off('user_location_update', handleUserLocationUpdate);
      socketService.off('alert', handleAlert);
    };
  }, []);

  // Sync GPS active state with tracking status
  useEffect(() => {
    setGpsActive(isTracking);
    
    // Verify GPS is actually enabled when tracking starts
    if (isTracking) {
      verifyGPSStatus();
    }
  }, [isTracking]);

  // Verify GPS status
  const verifyGPSStatus = async () => {
    try {
      const { granted } = await Location.getForegroundPermissionsAsync();
      
      if (!granted) {
        Alert.alert(
          'GPS Permission Required',
          'Sidekick needs location permission to track your position on the tracks.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Grant Permission',
              onPress: async () => {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') {
                  Alert.alert('Permission Denied', 'GPS tracking requires location permission.');
                }
              },
            },
          ]
        );
      } else {
        logger.info('GPS', 'GPS permissions verified - tracking enabled');
      }
    } catch (error) {
      logger.error('GPS', 'Failed to verify GPS status', error);
    }
  };

  // Load milepost data when authority changes
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    const loadHome = async () => {
      try {
        const stored = await AsyncStorage.getItem(HOME_POSITION_KEY);
        if (stored) {
          setHomePosition(JSON.parse(stored));
        }
      } catch (error) {
        console.warn('Failed to load home position:', error);
      }
    };
    loadHome();
  }, []);

  useEffect(() => {
    if (currentAuthority && currentAuthority.Subdivision_ID) {
      loadMilepostData(currentAuthority.Subdivision_ID);
      setSubdivision(currentAuthority.Subdivision_Name);
      setTrackSearchSubdivisionId((prev) => prev ?? currentAuthority.Subdivision_ID);
    }

    if (currentAuthority) {
      setTrackSearch((prev) => ({
        ...prev,
        trackType: prev.trackType || currentAuthority.Track_Type || '',
        trackNumber: prev.trackNumber || currentAuthority.Track_Number || '',
      }));
    }
  }, [currentAuthority]);

  useEffect(() => {
    const loadTrackSearchSubdivisions = async () => {
      const agencyId = getAgencyIdFromUser(user);
      if (!agencyId) return;
      try {
        const response = await apiService.getAgencySubdivisions(agencyId);
        const subdivisionList = Array.isArray(response?.data)
          ? response.data
          : Array.isArray(response?.subdivisions)
            ? response.subdivisions
            : Array.isArray(response?.data?.data)
              ? response.data.data
            : Array.isArray(response?.data?.subdivisions)
              ? response.data.subdivisions
              : [];

        const subdivisions = subdivisionList
          .map((sub) => {
            const id = sub.Subdivision_ID ?? sub.subdivision_id;
            const code = sub.Subdivision_Code ?? sub.subdivision_code ?? '';
            const name = sub.Subdivision_Name ?? sub.subdivision_name ?? '';
            const parsedId = Number(id);
            if (!Number.isFinite(parsedId)) return null;
            return {
              label: [code, name].filter(Boolean).join(' - ') || `Subdivision ${parsedId}`,
              value: parsedId,
            };
          })
          .filter(Boolean);
        setTrackSearchSubdivisions(subdivisions);
      } catch (error) {
        logger.warn('Map', 'Failed to load track-search subdivisions', error);
      }
    };

    loadTrackSearchSubdivisions();
  }, [user]);

  // Load layer list when screen mounts or authority changes
  useEffect(() => {
    if (isFocused) {
      loadLayers();
    }
  }, [currentAuthority?.Subdivision_ID, isFocused]);

  useEffect(() => {
    if (!isFocused || !currentAuthority?.Authority_ID) return;
    dispatch(fetchPins(currentAuthority.Authority_ID));
  }, [dispatch, isFocused, currentAuthority?.Authority_ID]);

  useEffect(() => {
    let cancelled = false;

    const autoEnableGps = async () => {
      if (!isFocused || gpsActive) {
        return;
      }

      try {
        await enableGpsTracking(false);
        if (!cancelled) {
          setGpsActive(true);
        }
      } catch (error) {
        logger.warn('GPS', 'Auto-enable skipped', error);
      }
    };

    autoEnableGps();
    return () => {
      cancelled = true;
    };
  }, [isFocused, currentAuthority?.Authority_ID, gpsActive]);

  // Sync local visibility when store visibility updates
  useEffect(() => {
    if (!storedLayerVisibility || Object.keys(storedLayerVisibility).length === 0) return;
    setLocalLayerVisibility((prev) => ({ ...prev, ...storedLayerVisibility }));
  }, [storedLayerVisibility]);

  // Load visible layers when region changes (debounced)
  useEffect(() => {
    if (!layers.length) return;
    if (layerFetchTimeout.current) {
      clearTimeout(layerFetchTimeout.current);
    }
    layerFetchTimeout.current = setTimeout(() => {
      if (isFocused) {
        loadVisibleLayerData();
      }
    }, 1200);
    return () => {
      if (layerFetchTimeout.current) {
        clearTimeout(layerFetchTimeout.current);
      }
    };
  }, [region, layers, layerVisibility, storedLayerVisibility, isFocused]);

  // Update milepost and boundaries when position changes
  useEffect(() => {
    if (currentPosition && mileposts.length > 0) {
      updateTrackingInfo();
    }
    
    // Fetch nearest railroad address from API
    if (currentPosition && currentAuthority) {
      fetchNearestRailroadAddress();
    }
  }, [currentPosition, mileposts]);

  // Fetch nearest railroad address from backend API
  const fetchNearestRailroadAddress = async () => {
    try {
      if (!currentPosition?.latitude || !currentPosition?.longitude) {
        return;
      }

      if (nearestAddressInFlight.current) {
        return;
      }

      const now = Date.now();
      const lastCoords = lastNearestAddressCoords.current;
      const movedMeters = lastCoords
        ? calculateDistanceMeters(
          lastCoords.latitude,
          lastCoords.longitude,
          currentPosition.latitude,
          currentPosition.longitude
        )
        : Infinity;

      const recentlyFetched = now - lastNearestAddressFetchAt.current < RAILROAD_ADDRESS_REQUEST_INTERVAL_MS;
      if (recentlyFetched && movedMeters < MIN_MOVE_FOR_ADDRESS_REFRESH_METERS) {
        return;
      }

      // Check if we have required data
      if (!currentAuthority || !currentAuthority.Subdivision_ID) {
        setNearestRailroadAddress('No active authority');
        return;
      }

      nearestAddressInFlight.current = true;
      lastNearestAddressFetchAt.current = now;
      lastNearestAddressCoords.current = {
        latitude: currentPosition.latitude,
        longitude: currentPosition.longitude,
      };
      setLoadingRailroadAddress(true);

      const response = await apiService.requestWithRetry(
        () =>
          apiService.api.post('/tracks/interpolate-milepost', {
            latitude: currentPosition.latitude,
            longitude: currentPosition.longitude,
            subdivisionId: currentAuthority.Subdivision_ID,
          }),
        2,
        800
      );
      
      if (response.data) {
        const { milepost, distance } = response.data;
        
        // Only show railroad address if within reasonable distance (e.g., 0.5 miles)
        if (distance && distance <= 0.5) {
          // Use track info from authority, milepost from API
          const trackType = currentAuthority.Track_Type || 'Track';
          const trackNumber = currentAuthority.Track_Number || '';
          const address = `${trackType} ${trackNumber}, MP ${milepost.toFixed(2)}`.trim();
          setNearestRailroadAddress(address);
          logger.info('GPS', 'Nearest railroad address found', { address, distance });
        } else {
          setNearestRailroadAddress('None found');
          logger.info('GPS', 'No railroad address nearby', { distance });
        }
      }
      
      setLoadingRailroadAddress(false);
    } catch (error) {
      const status = error?.response?.status;
      if (status === 404) {
        logger.info('GPS', 'No railroad address nearby', {
          reason: 'No track data found in subdivision',
        });
      } else {
        logger.error('GPS', 'Failed to fetch nearest railroad address', error);
      }
      setLoadingRailroadAddress(false);
      setNearestRailroadAddress('None found');
      
      // Fall back to local calculation if API fails
      if (currentPosition && mileposts.length > 0) {
        const trackInfo = getCurrentTrack(currentPosition.latitude, currentPosition.longitude, mileposts);
        if (trackInfo) {
          const trackType = currentAuthority.Track_Type || trackInfo.trackType || 'Track';
          const trackNumber = currentAuthority.Track_Number || trackInfo.trackNumber || '';
          const address = `${trackType} ${trackNumber}, MP ${trackInfo.milepost.toFixed(2)}`.trim();
          setNearestRailroadAddress(address);
        }
      }
    } finally {
      nearestAddressInFlight.current = false;
    }
  };

  // Update map when position changes in follow mode
  useEffect(() => {
    if (followMode && currentPosition && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: currentPosition.latitude,
        longitude: currentPosition.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
      
      // Send location update via socket
      if (user && currentAuthority) {
        socketService.emitLocationUpdate({
          userId: user.User_ID,
          agencyId: user.Agency_ID,
          latitude: currentPosition.latitude,
          longitude: currentPosition.longitude,
          authorityId: currentAuthority.authority_id || currentAuthority.id,
        });
      }
    }
  }, [currentPosition, followMode]);

  const loadActiveAuthority = async () => {
    try {
      setIsLoading(true);
      const authority = await dispatch(getActiveAuthority()).unwrap();
      
      // Start GPS tracking if authority exists and tracking not already started
      if (authority && !isTracking) {
        try {
          await gpsTrackingService.init();
          await gpsTrackingService.startTracking(authority);
          console.log('GPS tracking started for existing authority:', authority.Authority_ID);
        } catch (error) {
          console.error('Failed to start GPS tracking:', error);
        }
      }
      
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to load authority:', error);
      setIsLoading(false);
    }
  };

  const loadMilepostData = async (subdivisionId) => {
    try {
      const response = await apiService.api.get(
        `/offline/subdivision/${subdivisionId}`
      );
      if (!isMounted.current) return;
      if (response.data?.data?.mileposts) {
        setMileposts(response.data.data.mileposts);
      } else if (response.data?.mileposts) {
        setMileposts(response.data.mileposts);
      }
    } catch (error) {
      console.error('Failed to load milepost data:', error);
    }
  };

  const loadLayers = async () => {
    if (layersLoading) return;
    setLayersLoading(true);
    try {
      const data = await apiService.getMapLayers({
        subdivisionId: currentAuthority?.Subdivision_ID || undefined,
      });
      const list = data?.layers || [];
      if (!isMounted.current) return;
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
    } catch (error) {
      console.error('Failed to load map layers:', error);
    } finally {
      if (isMounted.current) {
        setLayersLoading(false);
      }
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

  const loadLayerData = async (layerId, bounds) => {
    try {
      const data = await apiService.getMapLayerData(layerId, {
        subdivisionId: currentAuthority?.Subdivision_ID || undefined,
        limit: 5000,
        ...bounds,
      });
      if (!isMounted.current) return;
      setLayerData((prev) => ({
        ...prev,
        [layerId]: data?.features || [],
      }));
    } catch (error) {
      console.error(`Failed to load layer data for ${layerId}:`, error);
    }
  };

  const loadVisibleLayerData = async () => {
    if (layerFetchInProgress.current) {
      return;
    }

    const visibility = Object.keys(storedLayerVisibility).length
      ? storedLayerVisibility
      : layerVisibility;

    const visibleLayerIds = layers
      .filter((layer) => visibility[layer.id] && (layer.count || 0) > 0)
      .map((layer) => layer.id);

    if (visibleLayerIds.length === 0) return;

    const latDelta = region.latitudeDelta || 0.05;
    const lngDelta = region.longitudeDelta || 0.05;
    const bounds = {
      minLat: region.latitude - latDelta * 0.6,
      maxLat: region.latitude + latDelta * 0.6,
      minLng: region.longitude - lngDelta * 0.6,
      maxLng: region.longitude + lngDelta * 0.6,
    };

    layerFetchInProgress.current = true;

    try {
      // Keep request pressure low to avoid DB connection pool spikes.
      for (const layerId of visibleLayerIds) {
        // eslint-disable-next-line no-await-in-loop
        await loadLayerData(layerId, bounds);
      }
    } finally {
      layerFetchInProgress.current = false;
    }
  };

  const handleMenuAction = async (action) => {
    setMenuOpen(false);

    if (action === 'home') {
      if (!homePosition) {
        Alert.alert('Home Position', 'No home position set yet.');
        return;
      }
      mapRef.current?.animateToRegion(homePosition);
      return;
    }

    if (action === 'set-home') {
      const nextHome = {
        latitude: region.latitude,
        longitude: region.longitude,
        latitudeDelta: region.latitudeDelta,
        longitudeDelta: region.longitudeDelta,
      };
      setHomePosition(nextHome);
      await AsyncStorage.setItem(HOME_POSITION_KEY, JSON.stringify(nextHome));
      Alert.alert('Home Position', 'Home position saved.');
      return;
    }

    if (action === 'reset-home') {
      setHomePosition(null);
      await AsyncStorage.removeItem(HOME_POSITION_KEY);
      Alert.alert('Home Position', 'Home position cleared.');
      return;
    }

    if (action === 'track-search') {
      setTrackSearchVisible(true);
      return;
    }

    if (action === 'logout') {
      Alert.alert(
        'Logout',
        'Are you sure you want to log out?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Logout',
            style: 'destructive',
            onPress: () => dispatch(logout()),
          },
        ]
      );
    }
  };

  const handleTrackSearch = async () => {
    const selectedSubdivisionId = trackSearchSubdivisionId || currentAuthority?.Subdivision_ID;
    if (!selectedSubdivisionId) {
      Alert.alert('Track Search', 'Please select a subdivision.');
      return;
    }

    const milepostValue = parseFloat(trackSearch.milepost);
    if (Number.isNaN(milepostValue)) {
      Alert.alert('Track Search', 'Please enter a valid milepost.');
      return;
    }

    setTrackSearchLoading(true);
    try {
      const response = await apiService.api.post('/tracks/location-search', {
        subdivisionId: selectedSubdivisionId,
        ls: trackSearch.lineSegment || null,
        milepost: milepostValue,
        trackType: trackSearch.trackType || null,
        trackNumber: trackSearch.trackNumber || null,
      });

      const data = response.data?.data;
      if (!data?.latitude || !data?.longitude) {
        Alert.alert('Track Search', 'No track location found for that criteria.');
        return;
      }

      const nextRegion = {
        latitude: data.latitude,
        longitude: data.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };

      setTrackSearchResult({
        ...data,
        latitude: data.latitude,
        longitude: data.longitude,
      });

      mapRef.current?.animateToRegion(nextRegion);
      setTrackSearchVisible(false);
    } catch (error) {
      console.error('Track search failed:', error);
      const serverMessage = error?.response?.data?.error || error?.response?.data?.message || (error?.response ? `Server error: ${error.response.status}` : error.message);
      // Log parameters used for the request to help debugging missing data on backend
      console.warn('Track search params:', {
        subdivisionId: selectedSubdivisionId,
        ls: trackSearch.lineSegment || null,
        milepost: trackSearch.milepost,
        trackType: trackSearch.trackType || null,
        trackNumber: trackSearch.trackNumber || null,
      });

      Alert.alert('Track Search', serverMessage || 'Failed to search for track location.');
    } finally {
      setTrackSearchLoading(false);
    }
  };

  const updateTrackingInfo = () => {
    const { latitude, longitude } = currentPosition;
    
    // Get current track and milepost
    const trackInfo = getCurrentTrack(latitude, longitude, mileposts);
    
    if (trackInfo) {
      setCurrentMilepost(trackInfo.milepost);
      
      // Use track info from authority if available, otherwise from trackGeometry calculation
      const trackType = currentAuthority?.Track_Type || trackInfo.trackType || 'Track';
      const trackNumber = currentAuthority?.Track_Number || trackInfo.trackNumber || '';
      
      setCurrentTrack({
        type: trackType,
        number: trackNumber,
      });
      
      // Update nearest railroad address
      const address = `${trackType} ${trackNumber}, MP ${trackInfo.milepost.toFixed(2)}`.trim();
      setNearestRailroadAddress(address);
      
      // Calculate heading if we have previous position
      if (previousPosition.current) {
        const bearing = calculateBearing(
          previousPosition.current.latitude,
          previousPosition.current.longitude,
          latitude,
          longitude
        );
        setHeading(bearing);
        
        // Calculate speed (rough estimate)
        const timeDiff = (new Date() - new Date(previousPosition.current.timestamp)) / 1000; // seconds
        if (timeDiff > 0 && currentPosition.speed !== undefined) {
          setSpeed(currentPosition.speed * 2.237); // Convert m/s to mph
        }
      }
      
      // Check authority boundaries
      if (currentAuthority) {
        const boundaryCheck = checkAuthorityBoundaries(
          { latitude, longitude },
          currentAuthority,
          mileposts
        );
        
        setWithinBoundaries(boundaryCheck.withinBoundaries);
        setDistanceToBegin(boundaryCheck.distanceToBegin);
        setDistanceToEnd(boundaryCheck.distanceToEnd);
        
        // Alert if outside boundaries
        if (!boundaryCheck.withinBoundaries) {
          console.warn('Outside authority boundaries:', boundaryCheck.reason);
        }
      }
    } else {
      setNearestRailroadAddress('None found');
    }
    
    previousPosition.current = {
      latitude,
      longitude,
      timestamp: new Date(),
    };
  };

  const handleUserLocationUpdate = (locationData) => {
    // Update other workers positions
    setOtherWorkers(prev => {
      const existingIndex = prev.findIndex(w => w.userId === locationData.userId);
      
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          ...locationData,
          timestamp: new Date().toISOString(),
        };
        return updated;
      } else {
        return [...prev, {
          ...locationData,
          timestamp: new Date().toISOString(),
        }];
      }
    });
  };

  const handleAlert = (alertData) => {
    Alert.alert(
      alertData.level === 'critical' ? '🚨 CRITICAL ALERT' : '⚠️ ALERT',
      alertData.message,
      [
        { text: 'Dismiss', style: 'cancel' },
        { text: 'View Details', onPress: () => handleViewAlert(alertData) },
      ]
    );
  };

  const handleViewAlert = (alertData) => {
    // Navigate to alert details or show in modal
    console.log('View alert:', alertData);
  };

  const toggleFollowMode = () => {
    setFollowMode(!followMode);
    
    if (!followMode && currentPosition) {
      // Center on current position
      mapRef.current?.animateToRegion({
        latitude: currentPosition.latitude,
        longitude: currentPosition.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    }
  };

  const centerOnCurrentLocation = async () => {
    try {
      const granted = await permissionManager.requestLocationPermission(false);
      
      if (!granted) {
        Alert.alert(
          'Permission Required',
          'Location permission is required to center on your position.'
        );
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      mapRef.current?.animateToRegion({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    } catch (error) {
      console.error('Failed to get location:', error);
    }
  };

  const centerOnAuthority = () => {
    if (currentAuthority && currentAuthority.Begin_MP && currentAuthority.End_MP) {
      // Calculate center of authority
      const centerLat = (currentAuthority.Begin_Lat + currentAuthority.End_Lat) / 2;
      const centerLng = (currentAuthority.Begin_Lng + currentAuthority.End_Lng) / 2;
      
      mapRef.current?.animateToRegion({
        latitude: centerLat,
        longitude: centerLng,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      });
    }
  };

  const enableGpsTracking = async (showAlerts = true) => {
    const { status: foregroundStatus } = await Location.getForegroundPermissionsAsync();

    if (foregroundStatus !== 'granted') {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (showAlerts) {
          Alert.alert(
            'Permission Required',
            'Sidekick needs location permission to track your position on the tracks.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ]
          );
        }
        throw new Error('Location permission denied');
      }
    }

    await gpsTrackingService.init();
    await gpsTrackingService.startTracking(currentAuthority || null);
    setGpsActive(true);
    logger.info('GPS', 'GPS tracking enabled successfully');

    if (showAlerts) {
      Alert.alert('GPS Enabled', 'Location tracking is now active.');
    }
  };

  const disableGpsTracking = async (showAlerts = true) => {
    await gpsTrackingService.stopTracking();
    setGpsActive(false);
    setNearestRailroadAddress('None found');
    logger.info('GPS', 'GPS tracking disabled');

    if (showAlerts) {
      Alert.alert('GPS Disabled', 'Location tracking has been stopped.');
    }
  };

  const getCurrentMapDestination = () => {
    if (currentPosition?.latitude && currentPosition?.longitude) {
      return `${currentPosition.latitude},${currentPosition.longitude}`;
    }
    return null;
  };

  const copyCurrentCoordinates = async () => {
    const destination = getCurrentMapDestination();
    if (!destination) {
      Alert.alert('Map', 'No live GPS position available yet.');
      return;
    }
    await Clipboard.setStringAsync(destination);
    Alert.alert('Copied', 'Coordinates copied to clipboard.');
  };

  const copyNearestRailAddress = async () => {
    if (!nearestRailroadAddress || nearestRailroadAddress === 'None found') {
      Alert.alert('Map', 'No nearby railroad address available.');
      return;
    }
    await Clipboard.setStringAsync(nearestRailroadAddress);
    Alert.alert('Copied', 'Nearest railroad address copied to clipboard.');
  };

  const openAppleMaps = async () => {
    const destination = getCurrentMapDestination();
    if (!destination) {
      Alert.alert('Map', 'No live GPS position available yet.');
      return;
    }
    if (Platform.OS !== 'ios') {
      Alert.alert('Apple Maps', 'Apple Maps is available on iOS only.');
      return;
    }
    await Linking.openURL(`http://maps.apple.com/?ll=${destination}&q=Rail+Location`);
  };

  const openGoogleMaps = async () => {
    const destination = getCurrentMapDestination();
    if (!destination) {
      Alert.alert('Map', 'No live GPS position available yet.');
      return;
    }

    if (Platform.OS === 'ios') {
      const navUrl = `comgooglemaps://?daddr=${destination}&directionsmode=driving`;
      const canOpen = await Linking.canOpenURL(navUrl);
      if (canOpen) {
        await Linking.openURL(navUrl);
        return;
      }
    }

    await Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`);
  };

  const renderAuthorityBoundaries = () => {
    if (!currentAuthority) return null;

    // This would use actual track geometry data
    // For now, create a simple line
    const coordinates = [
      { latitude: currentAuthority.Begin_Lat || region.latitude - 0.01, 
        longitude: currentAuthority.Begin_Lng || region.longitude - 0.01 },
      { latitude: currentAuthority.End_Lat || region.latitude + 0.01, 
        longitude: currentAuthority.End_Lng || region.longitude + 0.01 },
    ];

    return (
      <Polyline
        coordinates={coordinates}
        strokeColor="#FFD100"
        strokeWidth={4}
        lineDashPattern={[10, 10]}
      />
    );
  };

  const renderOtherWorkers = () => {
    return otherWorkers.map((worker, index) => (
      <Marker
        key={`worker-${worker.userId}-${index}`}
        coordinate={{
          latitude: worker.latitude,
          longitude: worker.longitude,
        }}
        title={`Worker: ${worker.employeeName || 'Unknown'}`}
        description={`Last updated: ${new Date(worker.timestamp).toLocaleTimeString()}`}
      >
        <View style={styles.workerMarker}>
          <MaterialCommunityIcons name="account" size={24} color="#FF0000" />
        </View>
      </Marker>
    ));
  };

  const layerMarkers = useMemo(() => {
    const markers = [];
    const visibility = Object.keys(storedLayerVisibility).length
      ? storedLayerVisibility
      : layerVisibility;

    layers.forEach((layer) => {
      if (!visibility[layer.id]) return;
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
  }, [layers, layerData, layerVisibility, storedLayerVisibility]);

  const getPinColor = (category) => {
    const normalized = String(category || '').toLowerCase();
    if (normalized.includes('defect')) return '#F44336';
    if (normalized.includes('obstruction')) return '#FF3B30';
    if (normalized.includes('monitor')) return '#FF9800';
    if (normalized.includes('scrap')) return '#2196F3';
    return '#00B894';
  };

  const pinMarkers = useMemo(() => {
    return (pins || [])
      .map((pin, index) => {
        const latitude = Number(pin.latitude ?? pin.Latitude);
        const longitude = Number(pin.longitude ?? pin.Longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          return null;
        }
        return {
          key: `pin-${pin.id || pin.Pin_ID || index}`,
          latitude,
          longitude,
          title: pin.category || pin.Pin_Category || 'Pin Drop',
          description: pin.notes || pin.Notes || (pin.milepost ? `MP ${pin.milepost}` : 'Pin drop'),
          color: getPinColor(pin.category || pin.Pin_Category),
          pending: Boolean(pin.syncPending),
        };
      })
      .filter(Boolean);
  }, [pins]);

  const renderControls = () => {
    if (!showControls) return null;

    return (
      <View style={styles.controlsCard}>
        {/* GPS Active Toggle with Minimize Button */}
        <View style={styles.controlRow}>
          <Text style={styles.controlLabel}>GPS Active</Text>
          <View style={styles.controlRowRight}>
            <Switch
              value={gpsActive}
              onValueChange={async (value) => {
                try {
                  if (value) {
                    await enableGpsTracking(true);
                  } else {
                    await disableGpsTracking(true);
                  }
                } catch (error) {
                  logger.error('GPS', 'Failed to update GPS tracking state', error);
                  setGpsActive(Boolean(isTracking));
                }
            }}
            trackColor={{ false: '#CCCCCC', true: '#34C759' }}
            thumbColor={gpsActive ? '#FFFFFF' : '#F4F3F4'}
            ios_backgroundColor="#CCCCCC"
          />
          <TouchableOpacity 
            style={styles.minimizeButton}
            onPress={() => setIsGpsCardMinimized(!isGpsCardMinimized)}
          >
            <MaterialCommunityIcons 
              name={isGpsCardMinimized ? 'chevron-down' : 'chevron-up'} 
              size={20} 
              color="#666666" 
            />
          </TouchableOpacity>
          </View>
        </View>

        {/* Show full content only when not minimized */}
        {!isGpsCardMinimized && (
          <>
        {/* Action Buttons Row */}
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity 
            style={[styles.actionButton, compassEnabled && styles.actionButtonActive]}
            onPress={() => {
              setCompassEnabled(!compassEnabled);
            }}
          >
            <MaterialCommunityIcons 
              name="compass-outline" 
              size={20} 
              color={compassEnabled ? '#FFD100' : '#666666'} 
            />
            <Text style={[styles.actionButtonText, compassEnabled && styles.actionButtonTextActive]}>
              Compass
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionButton, followMode && styles.actionButtonActive]}
            onPress={toggleFollowMode}
          >
            <MaterialCommunityIcons 
              name="crosshairs-gps" 
              size={20} 
              color={followMode ? '#FFD100' : '#666666'} 
            />
            <Text style={[styles.actionButtonText, followMode && styles.actionButtonTextActive]}>
              Follow Me
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionButton}
            onPress={centerOnCurrentLocation}
          >
            <MaterialCommunityIcons 
              name="target" 
              size={20} 
              color="#666666" 
            />
            <Text style={styles.actionButtonText}>Re-center</Text>
          </TouchableOpacity>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Coordinates Section */}
        <View style={styles.infoSection}>
          <View style={styles.infoHeader}>
            <MaterialCommunityIcons name="map-marker" size={16} color="#666666" />
            <Text style={styles.infoLabel}>Coordinates</Text>
          </View>
          {currentPosition ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoValue}>
                {currentPosition.latitude.toFixed(6)}, {currentPosition.longitude.toFixed(6)}
              </Text>
              <TouchableOpacity style={styles.iconButton} onPress={copyCurrentCoordinates}>
                <MaterialCommunityIcons name="content-copy" size={18} color="#FFD100" />
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.infoPlaceholder}>Waiting for location...</Text>
          )}
        </View>

        {/* Nearest Railroad Address Section */}
        <View style={styles.infoSection}>
          <View style={styles.infoHeader}>
            <MaterialCommunityIcons name="train" size={16} color="#666666" />
            <Text style={styles.infoLabel}>Nearest Railroad Address</Text>
          </View>
          <View style={styles.infoRow}>
            {loadingRailroadAddress ? (
              <ActivityIndicator size="small" color="#FFD100" />
            ) : (
              <Text style={styles.infoValue}>{nearestRailroadAddress}</Text>
            )}
            {nearestRailroadAddress !== 'None found' && !loadingRailroadAddress && (
              <TouchableOpacity style={styles.iconButton} onPress={copyNearestRailAddress}>
                <MaterialCommunityIcons name="content-copy" size={18} color="#FFD100" />
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.mapActionRow}>
            <TouchableOpacity style={styles.mapActionButton} onPress={openAppleMaps}>
              <Text style={styles.mapActionText}>Apple Maps</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.mapActionButton} onPress={openGoogleMaps}>
              <Text style={styles.mapActionText}>Google Maps</Text>
            </TouchableOpacity>
          </View>
        </View>
        </>
        )}
      </View>
    );
  };

  const renderAuthorityInfo = () => {
    if (!currentAuthority) return null;

    return (
      <View style={styles.authorityInfo}>
        <View style={styles.authorityHeader}>
          <MaterialCommunityIcons name="clipboard-check" size={20} color="#FFD100" />
          <Text style={styles.authorityTitle}>Active Authority</Text>
        </View>
        
        <View style={styles.authorityDetails}>
          <Text style={styles.authorityText}>
            {currentAuthority.Subdivision_Code || currentAuthority.Subdivision_Name}: {currentAuthority.Track_Type} {currentAuthority.Track_Number}
          </Text>
          <Text style={styles.authorityText}>
            MP {currentAuthority.Begin_MP} to {currentAuthority.End_MP}
          </Text>
          <Text style={styles.authorityText}>
            Started: {currentAuthority.Start_Time ? new Date(currentAuthority.Start_Time).toLocaleTimeString() : 'Invalid Date'}
          </Text>
        </View>
        
        <View style={styles.positionInfo}>
          {currentPosition && (
            <>
              <Text style={styles.positionText}>
                Position: {currentPosition.latitude.toFixed(6)}, {currentPosition.longitude.toFixed(6)}
              </Text>
              <Text style={styles.positionText}>
                Accuracy: {currentPosition.accuracy?.toFixed(1) || 'Unknown'} meters
              </Text>
            </>
          )}
        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFD100" />
        <Text style={styles.loadingText}>Loading map data...</Text>
      </View>
    );
  }

  const selectedStyle = getMapStyleById(mapStyleId);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        mapType={selectedStyle.mapType}
        customMapStyle={selectedStyle.customStyle || customMapStyle}
        region={region}
        onRegionChangeComplete={setRegion}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsCompass={true}
        showsScale={true}
        loadingEnabled={true}
        loadingIndicatorColor="#FFD100"
        loadingBackgroundColor="#000000"
      >
        {/* Layer markers */}
        {layerMarkers.map((marker) => (
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

        {trackSearchResult && (
          <Marker
            key="track-search-result"
            coordinate={{
              latitude: trackSearchResult.latitude,
              longitude: trackSearchResult.longitude,
            }}
            title="Track Location"
            description={`MP ${trackSearchResult.milepost ?? ''}`}
            pinColor="#FF7A00"
            tracksViewChanges={false}
          >
            <View style={[styles.layerMarker, { borderColor: '#FF7A00' }]}>
              <MaterialCommunityIcons name="crosshairs-gps" size={18} color="#FF7A00" />
            </View>
          </Marker>
        )}

        {/* Pin drop markers */}
        {pinMarkers.map((pin) => (
          <Marker
            key={pin.key}
            coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
            title={pin.title}
            description={pin.pending ? `${pin.description} (Pending sync)` : pin.description}
            pinColor={pin.color}
            tracksViewChanges={false}
          >
            <View style={[styles.layerMarker, { borderColor: pin.color }]}>
              <MaterialCommunityIcons
                name={pin.pending ? 'map-marker-alert' : 'map-marker'}
                size={18}
                color={pin.color}
              />
            </View>
          </Marker>
        ))}

        {/* Authority boundaries */}
        {renderAuthorityBoundaries()}
        
        {/* Other workers */}
        {renderOtherWorkers()}
        
        {/* Current position marker */}
        {currentPosition && (
          <Marker
            coordinate={{
              latitude: currentPosition.latitude,
              longitude: currentPosition.longitude,
            }}
            title="My Position"
            description={`Accuracy: ${currentPosition.accuracy?.toFixed(1) || 'Unknown'}m`}
          >
            <View style={styles.myMarker}>
              <MaterialCommunityIcons name="account" size={30} color="#FFD100" />
            </View>
          </Marker>
        )}
      </MapView>

      {/* Offline Indicator */}
      <View style={styles.offlineContainer}>
        <OfflineIndicator />
      </View>

      {/* GPS Accuracy Indicator */}
      <GPSAccuracyIndicator 
        accuracy={currentPosition?.coords?.accuracy || currentPosition?.accuracy}
        show={true}
      />

      {/* Milepost Display - shown in Follow-Me mode */}
      {followMode && currentPosition && (
        <MilepostDisplay
          milepost={currentMilepost}
          trackType={currentTrack?.type}
          trackNumber={currentTrack?.number}
          subdivision={subdivision}
          heading={heading}
          speed={speed}
        />
      )}

      {/* Boundary Indicator - shown when authority is active */}
      {currentAuthority && followMode && (
        <BoundaryIndicator
          distanceToBegin={distanceToBegin}
          distanceToEnd={distanceToEnd}
          withinBoundaries={withinBoundaries}
        />
      )}

      {/* GPS Controls Panel */}
      {showControls && renderControls()}
      
      {/* Authority info panel */}
      {!followMode && renderAuthorityInfo()}
      
      {/* GPS Controls Toggle Button */}
      <TouchableOpacity
        style={styles.gpsToggleButton}
        onPress={() => setShowControls((prev) => !prev)}
      >
        <MaterialCommunityIcons
          name={showControls ? 'close' : 'satellite-variant'}
          size={22}
          color="#FFFFFF"
        />
      </TouchableOpacity>

      {/* Hamburger Menu Button */}
      <TouchableOpacity
        style={styles.menuToggleButton}
        onPress={() => setMenuOpen((prev) => !prev)}
      >
        <MaterialCommunityIcons name="menu" size={22} color="#FFFFFF" />
      </TouchableOpacity>

      {menuOpen && (
        <View style={styles.mapMenu}>
          <TouchableOpacity
            style={styles.mapMenuItem}
            onPress={() => handleMenuAction('home')}
          >
            <MaterialCommunityIcons name="home" size={16} color="#FF7A00" />
            <Text style={styles.mapMenuText}>Go To Home Position</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.mapMenuItem}
            onPress={() => handleMenuAction('set-home')}
          >
            <MaterialCommunityIcons name="home-edit" size={16} color="#FF7A00" />
            <Text style={styles.mapMenuText}>Set Home Position</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.mapMenuItem}
            onPress={() => handleMenuAction('reset-home')}
          >
            <MaterialCommunityIcons name="home-remove" size={16} color="#FF7A00" />
            <Text style={styles.mapMenuText}>Reset Home Position</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.mapMenuItem}
            onPress={() => handleMenuAction('track-search')}
          >
            <MaterialCommunityIcons name="map-search" size={16} color="#FF7A00" />
            <Text style={styles.mapMenuText}>Track Location Search</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.mapMenuItem}
            onPress={() => handleMenuAction('logout')}
          >
            <MaterialCommunityIcons name="logout" size={16} color="#FF3B30" />
            <Text style={[styles.mapMenuText, { color: '#FF3B30' }]}>Logout</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal
        visible={trackSearchVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTrackSearchVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.trackSearchCard}>
            <View style={styles.trackSearchHeader}>
              <Text style={styles.trackSearchTitle}>Track Location Search</Text>
              <TouchableOpacity onPress={() => setTrackSearchVisible(false)}>
                <MaterialCommunityIcons name="close" size={18} color="#666666" />
              </TouchableOpacity>
            </View>

            <View style={styles.trackSearchField}>
              <Text style={styles.trackSearchLabel}>Subdivision</Text>
              <DropDownPicker
                open={trackSearchSubdivisionOpen}
                value={trackSearchSubdivisionId}
                items={trackSearchSubdivisions}
                setOpen={setTrackSearchSubdivisionOpen}
                setValue={(callback) => {
                  const nextValue = callback(trackSearchSubdivisionId);
                  setTrackSearchSubdivisionId(nextValue);
                }}
                setItems={setTrackSearchSubdivisions}
                placeholder="Select subdivision"
                style={styles.trackSearchInput}
                dropDownContainerStyle={styles.trackSearchDropdownContainer}
                textStyle={{ color: '#333333', fontSize: 12 }}
                listMode="SCROLLVIEW"
                zIndex={3000}
                zIndexInverse={1000}
              />
            </View>

            <View style={styles.trackSearchField}>
              <Text style={styles.trackSearchLabel}>Line Segment</Text>
              <TextInput
                value={trackSearch.lineSegment}
                onChangeText={(value) => setTrackSearch((prev) => ({ ...prev, lineSegment: value }))}
                placeholder="LS"
                placeholderTextColor="#999999"
                style={styles.trackSearchInput}
              />
            </View>

            <View style={styles.trackSearchField}>
              <Text style={styles.trackSearchLabel}>Milepost</Text>
              <TextInput
                value={trackSearch.milepost}
                onChangeText={(value) => setTrackSearch((prev) => ({ ...prev, milepost: value }))}
                placeholder="MP"
                placeholderTextColor="#999999"
                keyboardType="numeric"
                style={styles.trackSearchInput}
              />
            </View>

            <View style={styles.trackSearchField}>
              <Text style={styles.trackSearchLabel}>Track Type</Text>
              <TextInput
                value={trackSearch.trackType}
                onChangeText={(value) => setTrackSearch((prev) => ({ ...prev, trackType: value }))}
                placeholder="Track Type"
                placeholderTextColor="#999999"
                style={styles.trackSearchInput}
              />
            </View>

            <View style={styles.trackSearchField}>
              <Text style={styles.trackSearchLabel}>Track Number</Text>
              <TextInput
                value={trackSearch.trackNumber}
                onChangeText={(value) => setTrackSearch((prev) => ({ ...prev, trackNumber: value }))}
                placeholder="Track Number"
                placeholderTextColor="#999999"
                style={styles.trackSearchInput}
              />
            </View>

            <TouchableOpacity
              style={styles.trackSearchButton}
              onPress={handleTrackSearch}
              disabled={trackSearchLoading}
            >
              {trackSearchLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.trackSearchButtonText}>Search</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  loadingText: {
    color: '#FFFFFF',
    marginTop: 10,
    fontSize: 16,
  },
  offlineContainer: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 100,
    zIndex: 1000,
  },
  
  // New White Control Card Styles
  controlsCard: {
    position: 'absolute',
    top: 80,
    left: 20,
    right: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 0,
    paddingBottom: 0,
  },
  controlRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  controlLabel: {
    fontSize: 15,
    color: '#000000',
    fontWeight: '600',
  },
  minimizeButton: {
    padding: 4,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
    marginBottom: 10,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: '#F5F5F5',
    gap: 4,
  },
  actionButtonActive: {
    backgroundColor: '#FFF9E6',
    borderWidth: 1,
    borderColor: '#FFD100',
  },
  actionButtonText: {
    fontSize: 12,
    color: '#666666',
    fontWeight: '500',
  },
  actionButtonTextActive: {
    color: '#FFD100',
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E5E5',
    marginVertical: 10,
  },
  infoSection: {
    marginBottom: 10,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  infoLabel: {
    fontSize: 12,
    color: '#666666',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F9F9F9',
    padding: 8,
    borderRadius: 6,
  },
  infoValue: {
    fontSize: 12,
    color: '#000000',
    flex: 1,
    fontWeight: '500',
  },
  infoPlaceholder: {
    fontSize: 13,
    color: '#999999',
    fontStyle: 'italic',
    backgroundColor: '#F9F9F9',
    padding: 10,
    borderRadius: 6,
  },
  iconButton: {
    padding: 4,
    marginLeft: 8,
  },
  mapActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  mapActionButton: {
    flex: 1,
    backgroundColor: '#FFF4CC',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FFD100',
    paddingVertical: 8,
    alignItems: 'center',
  },
  mapActionText: {
    color: '#5A4A00',
    fontSize: 12,
    fontWeight: '700',
  },
  gpsToggleButton: {
    position: 'absolute',
    top: 20,
    left: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderRadius: 18,
    padding: 10,
    borderWidth: 1,
    borderColor: '#FFD100',
  },
  menuToggleButton: {
    position: 'absolute',
    top: 70,
    left: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderRadius: 18,
    padding: 10,
    borderWidth: 1,
    borderColor: '#FF7A00',
  },
  mapMenu: {
    position: 'absolute',
    top: 110,
    left: 20,
    width: 220,
    backgroundColor: '#F2F2F2',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 5,
  },
  mapMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    gap: 8,
  },
  mapMenuText: {
    fontSize: 12,
    color: '#333333',
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  trackSearchCard: {
    width: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 5,
  },
  trackSearchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  trackSearchTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333333',
  },
  trackSearchField: {
    marginBottom: 8,
  },
  trackSearchLabel: {
    fontSize: 11,
    color: '#666666',
    marginBottom: 4,
  },
  trackSearchInput: {
    borderWidth: 1,
    borderColor: '#DDDDDD',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    color: '#333333',
    backgroundColor: '#FAFAFA',
  },
  trackSearchDropdownContainer: {
    borderWidth: 1,
    borderColor: '#DDDDDD',
    backgroundColor: '#FFFFFF',
  },
  trackSearchButton: {
    marginTop: 6,
    backgroundColor: '#FF7A00',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  trackSearchButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  authorityInfo: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderRadius: 8,
    padding: 12,
    borderWidth: 2,
    borderColor: '#FFD100',
  },
  authorityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  authorityTitle: {
    color: '#FFD100',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  authorityDetails: {
    marginBottom: 8,
  },
  authorityText: {
    color: '#FFFFFF',
    fontSize: 13,
    marginBottom: 2,
  },
  positionInfo: {
    borderTopWidth: 1,
    borderTopColor: '#333333',
    paddingTop: 8,
  },
  positionText: {
    color: '#CCCCCC',
    fontSize: 11,
    marginBottom: 2,
  },
  myMarker: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 20,
    padding: 5,
    borderWidth: 2,
    borderColor: '#FFD100',
  },
  workerMarker: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 15,
    padding: 3,
    borderWidth: 2,
    borderColor: '#FF0000',
  },
  layerMarker: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
  },
});

export default MapScreen;

