import { NativeModules, Platform } from 'react-native';
import Constants from 'expo-constants';

// Prefer explicit override via environment or Expo constants
const OVERRIDE_API_URL = process.env.EXPO_PUBLIC_API_URL || Constants.manifest?.extra?.API_URL || Constants.expoConfig?.extra?.API_URL;
const OVERRIDE_SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || Constants.manifest?.extra?.SOCKET_URL || Constants.expoConfig?.extra?.SOCKET_URL;

// Defaults for local development. DO NOT hardcode these for production.
const LOCAL_HOST_IOS = 'http://localhost:5000/api';
const ANDROID_EMULATOR = 'http://10.0.2.2:5000/api';
const DEV_API_PORT = '5000';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const DISALLOWED_TUNNEL_HOST_FRAGMENTS = ['exp.direct', 'exp.host'];

const extractHost = (value) => {
  if (!value || typeof value !== 'string') return null;

  // Try full URL first, e.g. "http://192.168.1.10:8081/index.bundle?...".
  try {
    const parsed = new URL(value);
    if (parsed.hostname) return parsed.hostname;
  } catch (error) {
    // Not a full URL; continue with host:port style parsing.
  }

  // Handle "192.168.1.10:8081" and similar.
  const firstSegment = value.split('/')[0] || '';
  const host = firstSegment.split(':')[0];
  return host || null;
};

const extractExpoHost = () => {
  const candidates = [
    Constants.expoConfig?.hostUri,
    Constants.manifest?.hostUri,
    Constants.manifest2?.extra?.expoClient?.hostUri,
    Constants.manifest?.debuggerHost,
    Constants.experienceUrl,
    Constants.linkingUri,
    NativeModules?.SourceCode?.scriptURL
  ];

  for (const candidate of candidates) {
    const host = extractHost(candidate);
    const isTunnelHost = host && DISALLOWED_TUNNEL_HOST_FRAGMENTS.some((fragment) => host.includes(fragment));
    if (host && !LOCAL_HOSTS.has(host) && !isTunnelHost) {
      return host;
    }
  }

  return null;
};

const getDeviceBaseUrl = () => {
  const host = extractExpoHost();
  if (!host) return null;
  return `http://${host}:${DEV_API_PORT}/api`;
};

const ENV = {
  development: {
    API_URL: OVERRIDE_API_URL || null,
    SOCKET_URL: OVERRIDE_SOCKET_URL || null,
    MAPBOX_TOKEN: 'your-mapbox-token',
    GOOGLE_MAPS_API_KEY: 'your-google-maps-api-key',
    APP_NAME: 'Sidekick (Dev)'
  },
  staging: {
    API_URL: 'https://staging-api.herzog.com/api',
    SOCKET_URL: 'https://staging-api.herzog.com',
    MAPBOX_TOKEN: 'your-mapbox-token-staging',
    GOOGLE_MAPS_API_KEY: 'your-google-maps-api-key-staging',
    APP_NAME: 'Sidekick (Staging)'
  },
  production: {
    API_URL: 'https://api.herzog.com/api',
    SOCKET_URL: 'https://api.herzog.com',
    MAPBOX_TOKEN: 'your-mapbox-token-prod',
    GOOGLE_MAPS_API_KEY: 'your-google-maps-api-key-prod',
    APP_NAME: 'Sidekick'
  }
};

const chooseBaseUrl = (env = process.env.NODE_ENV || 'development') => {
  // If explicit override provided, use it
  if (OVERRIDE_API_URL) return OVERRIDE_API_URL;

  // Prefer detected Expo/Metro host when available.
  const hostBasedUrl = getDeviceBaseUrl();
  if (hostBasedUrl) return hostBasedUrl;

  // Use runtime detection for device vs simulator/emulator
  const isDevice = Constants.isDevice === true;

  // Simulator / emulator
  if (!isDevice) {
    if (Platform.OS === 'ios') return LOCAL_HOST_IOS;
    if (Platform.OS === 'android') return ANDROID_EMULATOR;
  }

  // Physical device: prefer Expo host IP to avoid stale hardcoded LAN addresses.
  if (isDevice) {
    console.warn('Unable to detect Expo host IP on physical device. Set EXPO_PUBLIC_API_URL (for example: http://192.168.x.x:5000/api).');
  }

  // Last-resort fallback for non-device runtimes only.
  return Platform.OS === 'android' ? ANDROID_EMULATOR : LOCAL_HOST_IOS;
};

const getEnvVars = (env = process.env.NODE_ENV || 'development') => {
  const base = ENV[env] || ENV.development;
  const apiUrl = OVERRIDE_API_URL || base.API_URL || chooseBaseUrl(env);
  const socketUrl = OVERRIDE_SOCKET_URL || base.SOCKET_URL || (apiUrl ? apiUrl.replace(/\/api$/, '') : null);

  console.log('Environment config:', {
    env,
    platform: Platform.OS,
    isDevice: Constants.isDevice,
    apiUrl,
    socketUrl
  });

  return {
    API_URL: apiUrl,
    SOCKET_URL: socketUrl,
    MAPBOX_TOKEN: base.MAPBOX_TOKEN,
    GOOGLE_MAPS_API_KEY: base.GOOGLE_MAPS_API_KEY,
    APP_NAME: base.APP_NAME
  };
};

export default getEnvVars();
