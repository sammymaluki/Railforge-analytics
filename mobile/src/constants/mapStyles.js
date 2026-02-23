export const MAP_STYLES = [
  {
    id: 'dark_gray',
    label: 'Dark Gray',
    mapType: 'standard',
    customStyle: [
      { elementType: 'geometry', stylers: [{ color: '#2a2a2a' }] },
      { elementType: 'labels.text.fill', stylers: [{ color: '#7a7a7a' }] },
      { elementType: 'labels.text.stroke', stylers: [{ color: '#1f1f1f' }] },
      { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#3a3a3a' }] },
      { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
      { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    ],
  },
  {
    id: 'dark_gray_labels',
    label: 'Dark Gray with Labels',
    mapType: 'standard',
    customStyle: [
      { elementType: 'geometry', stylers: [{ color: '#2a2a2a' }] },
      { elementType: 'labels.text.fill', stylers: [{ color: '#b0b0b0' }] },
      { elementType: 'labels.text.stroke', stylers: [{ color: '#1f1f1f' }] },
      { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#3a3a3a' }] },
      { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
      { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'on' }] },
    ],
  },
  {
    id: 'light_gray',
    label: 'Light Gray',
    mapType: 'standard',
    customStyle: [
      { elementType: 'geometry', stylers: [{ color: '#f2f2f2' }] },
      { elementType: 'labels.text.fill', stylers: [{ color: '#7a7a7a' }] },
      { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
      { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#dcdcdc' }] },
      { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9c9c9' }] },
      { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    ],
  },
  {
    id: 'light_gray_labels',
    label: 'Light Gray with Labels',
    mapType: 'standard',
    customStyle: [
      { elementType: 'geometry', stylers: [{ color: '#f2f2f2' }] },
      { elementType: 'labels.text.fill', stylers: [{ color: '#5f5f5f' }] },
      { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
      { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#dcdcdc' }] },
      { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9c9c9' }] },
      { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'on' }] },
    ],
  },
  {
    id: 'dark_terrain',
    label: 'Dark Terrain',
    mapType: 'terrain',
    customStyle: [
      { elementType: 'geometry', stylers: [{ color: '#2b2b2b' }] },
      { elementType: 'labels.text.fill', stylers: [{ color: '#9a9a9a' }] },
      { elementType: 'labels.text.stroke', stylers: [{ color: '#1f1f1f' }] },
      { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#1b1b1b' }] },
    ],
  },
  {
    id: 'dark_terrain_labels',
    label: 'Dark Terrain with Labels',
    mapType: 'terrain',
    customStyle: [
      { elementType: 'geometry', stylers: [{ color: '#2b2b2b' }] },
      { elementType: 'labels.text.fill', stylers: [{ color: '#c0c0c0' }] },
      { elementType: 'labels.text.stroke', stylers: [{ color: '#1f1f1f' }] },
      { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#1b1b1b' }] },
    ],
  },
  {
    id: 'terrain_labels',
    label: 'Terrain with Labels',
    mapType: 'terrain',
    customStyle: null,
  },
  {
    id: 'imagery',
    label: 'Imagery',
    mapType: 'satellite',
    customStyle: null,
  },
  {
    id: 'imagery_labels',
    label: 'Imagery with Labels',
    mapType: 'hybrid',
    customStyle: null,
  },
  {
    id: 'streets',
    label: 'Streets',
    mapType: 'standard',
    customStyle: null,
  },
  {
    id: 'night_streets',
    label: 'Night Streets',
    mapType: 'standard',
    customStyle: [
      { elementType: 'geometry', stylers: [{ color: '#212121' }] },
      { elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
      { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
      { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c2c2c' }] },
      { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#000000' }] },
    ],
  },
  {
    id: 'streets_relief',
    label: 'Streets with Relief',
    mapType: 'terrain',
    customStyle: null,
  },
  {
    id: 'navigation',
    label: 'Navigation',
    mapType: 'standard',
    customStyle: null,
  },
  {
    id: 'night_navigation',
    label: 'Night Navigation',
    mapType: 'standard',
    customStyle: [
      { elementType: 'geometry', stylers: [{ color: '#1c1c1c' }] },
      { elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
      { elementType: 'labels.text.stroke', stylers: [{ color: '#1c1c1c' }] },
      { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2b2b2b' }] },
      { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f0f0f' }] },
    ],
  },
  {
    id: 'osm_dark_gray',
    label: 'OSM Dark Gray',
    mapType: 'standard',
    customStyle: [
      { elementType: 'geometry', stylers: [{ color: '#2a2a2a' }] },
      { elementType: 'labels.text.fill', stylers: [{ color: '#9a9a9a' }] },
      { elementType: 'labels.text.stroke', stylers: [{ color: '#1f1f1f' }] },
    ],
  },
  {
    id: 'osm_dark_gray_labels',
    label: 'OSM Dark Gray with Labels',
    mapType: 'standard',
    customStyle: [
      { elementType: 'geometry', stylers: [{ color: '#2a2a2a' }] },
      { elementType: 'labels.text.fill', stylers: [{ color: '#c0c0c0' }] },
      { elementType: 'labels.text.stroke', stylers: [{ color: '#1f1f1f' }] },
    ],
  },
  {
    id: 'osm_light_gray',
    label: 'OSM Light Gray',
    mapType: 'standard',
    customStyle: [
      { elementType: 'geometry', stylers: [{ color: '#f1f1f1' }] },
      { elementType: 'labels.text.fill', stylers: [{ color: '#7a7a7a' }] },
      { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
    ],
  },
  {
    id: 'osm_light_gray_labels',
    label: 'OSM Light Gray with Labels',
    mapType: 'standard',
    customStyle: [
      { elementType: 'geometry', stylers: [{ color: '#f1f1f1' }] },
      { elementType: 'labels.text.fill', stylers: [{ color: '#5a5a5a' }] },
      { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
    ],
  },
  {
    id: 'osm_streets',
    label: 'OSM Streets',
    mapType: 'standard',
    customStyle: null,
  },
  {
    id: 'osm_streets_relief',
    label: 'OSM Streets with Relief',
    mapType: 'terrain',
    customStyle: null,
  },
  {
    id: 'topographic',
    label: 'Topographic',
    mapType: 'terrain',
    customStyle: null,
  },
];

export const DEFAULT_MAP_STYLE_ID = 'imagery_labels';

export const getMapStyleById = (id) => {
  const match = MAP_STYLES.find((style) => style.id === id);
  return match || MAP_STYLES.find((style) => style.id === DEFAULT_MAP_STYLE_ID);
};
