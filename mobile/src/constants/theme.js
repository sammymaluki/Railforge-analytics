// RailForge Analytics Theme
// Primary: White & Black, Indicator: Yellow #FFD100

export const COLORS = {
  // Primary Colors
  primary: '#000000',      // Black
  secondary: '#FFFFFF',    // White
  accent: '#FFD100',       // Yellow (Indicator/Alert color)
  
  // Background Colors
  background: '#000000',
  surface: '#1A1A1A',
  card: '#2A2A2A',
  cardBackground: '#1A1A1A', // Alias for surface
  
  // Text Colors
  text: '#FFFFFF',
  textPrimary: '#FFFFFF', // Alias for text
  textSecondary: '#CCCCCC',
  textDisabled: '#666666',
  
  // Status Colors
  success: '#4CAF50',
  warning: '#FFD100',      // Yellow
  error: '#F44336',
  info: '#2196F3',
  
  // Alert Levels
  alertInformational: '#2196F3',
  alertWarning: '#FFD100',
  alertCritical: '#FF6B00',
  alertEmergency: '#F44336',
  
  // Authority Status
  authorityActive: '#4CAF50',
  authorityInactive: '#666666',
  authorityExpiring: '#FFD100',
  
  // Map Colors
  trackMain: '#FFFFFF',
  trackSiding: '#FFD100',
  trackYard: '#CCCCCC',
  boundaryGreen: '#4CAF50',
  boundaryYellow: '#FFD100',
  boundaryRed: '#F44336',
  
  // UI Elements
  border: '#333333',
  divider: '#2A2A2A',
  overlay: 'rgba(0, 0, 0, 0.7)',
  shadow: 'rgba(0, 0, 0, 0.5)',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const FONT_SIZES = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 24,
  xxl: 32,
  xxxl: 40,
};

export const FONT_WEIGHTS = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
};

export const BORDER_RADIUS = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  round: 999,
};

export const SHADOWS = {
  sm: {
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
};

// Alert Distance Thresholds (in miles) - Configurable
export const ALERT_DISTANCES = {
  INFORMATIONAL: 1.0,
  WARNING: 0.75,
  CRITICAL: 0.50,
  EMERGENCY: 0.25,
};

// Default theme object with lowercase property names for consistency
export default {
  colors: COLORS,
  spacing: SPACING,
  fontSize: FONT_SIZES,
  fontWeight: FONT_WEIGHTS,
  borderRadius: BORDER_RADIUS,
  shadows: {
    small: SHADOWS.sm,
    medium: SHADOWS.md,
    large: SHADOWS.lg,
  },
  alertDistances: ALERT_DISTANCES,
  // Keep old structure for backward compatibility during migration
  COLORS,
  SPACING,
  FONT_SIZES,
  FONT_WEIGHTS,
  BORDER_RADIUS,
  SHADOWS,
  ALERT_DISTANCES,
};
