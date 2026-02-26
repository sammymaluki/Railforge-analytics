import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from '../../constants/theme';

const DEFAULT_HUD_CONFIG = {
  showSubdivision: true,
  showMilepost: true,
  showTrackNumber: true,
  showTrackType: true,
  showGpsAccuracy: true,
  milepostDecimals: 4,
  labelStyle: 'full',
  trackFormat: 'combined',
};

const MilepostDisplay = ({
  milepost,
  trackType,
  trackNumber,
  subdivision,
  heading,
  speed,
  gpsAccuracy,
  gpsConfidence,
  gpsConfidenceScore,
  hudConfig = {},
}) => {
  const config = { ...DEFAULT_HUD_CONFIG, ...(hudConfig || {}) };
  const labelStyle = config.labelStyle === 'compact' ? 'compact' : 'full';
  const milepostDecimals = Math.max(0, Math.min(6, Number.parseInt(config.milepostDecimals, 10) || 4));

  const getCompassDirection = (deg) => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(deg / 45) % 8;
    return directions[index];
  };

  const getAccuracyText = () => {
    const accuracyValue = Number(gpsAccuracy);
    if (!Number.isFinite(accuracyValue) || accuracyValue < 0) {
      return 'No GPS';
    }
    return `+-${accuracyValue.toFixed(0)}m`;
  };

  const milepostText = (() => {
    const parsed = Number(milepost);
    if (!Number.isFinite(parsed)) return '--';
    return `MP ${parsed.toFixed(milepostDecimals)}`;
  })();

  const trackCombined = [
    config.showTrackType ? trackType : null,
    config.showTrackNumber ? trackNumber : null,
  ].filter(Boolean).join(' ');
  const showCombinedTrack = config.trackFormat === 'combined' && (config.showTrackType || config.showTrackNumber);

  return (
    <View style={styles.container}>
      {config.showMilepost && (
        <View style={styles.mainDisplay}>
          <Text style={styles.label}>
            {labelStyle === 'compact' ? 'MP' : 'CURRENT MILEPOST'}
          </Text>
          <Text style={styles.milepost}>{milepostText}</Text>
        </View>
      )}

      {(config.showTrackType || config.showTrackNumber || config.showSubdivision || config.showGpsAccuracy) && (
        <View style={styles.separator} />
      )}

      <View style={styles.trackInfo}>
        {showCombinedTrack && (
          <View style={styles.infoRow}>
            <Ionicons name="train" size={16} color={COLORS.accent} />
            <Text style={styles.trackText}>{trackCombined || 'No Track'}</Text>
          </View>
        )}

        {config.trackFormat === 'split' && config.showTrackType && (
          <View style={styles.infoRow}>
            <Ionicons name="git-branch" size={16} color={COLORS.accent} />
            <Text style={styles.subdivisionText}>
              {labelStyle === 'compact' ? 'Type:' : 'Track Type:'} {trackType || '--'}
            </Text>
          </View>
        )}

        {config.trackFormat === 'split' && config.showTrackNumber && (
          <View style={styles.infoRow}>
            <Ionicons name="pricetag" size={16} color={COLORS.accent} />
            <Text style={styles.subdivisionText}>
              {labelStyle === 'compact' ? '#' : 'Track #:'} {trackNumber || '--'}
            </Text>
          </View>
        )}

        {config.showSubdivision && (
          <View style={styles.infoRow}>
            <Ionicons name="location" size={16} color={COLORS.accent} />
            <Text style={styles.subdivisionText}>
              {labelStyle === 'compact' ? 'Sub:' : 'Subdivision:'} {subdivision || '--'}
            </Text>
          </View>
        )}

        {config.showGpsAccuracy && (
          <View style={styles.infoRow}>
            <Ionicons name="locate" size={16} color={COLORS.accent} />
            <Text style={styles.subdivisionText}>
              {labelStyle === 'compact' ? 'GPS:' : 'GPS Accuracy:'} {getAccuracyText()}
            </Text>
          </View>
        )}

        {!!gpsConfidence && (
          <View style={styles.infoRow}>
            <Ionicons name="analytics" size={16} color={COLORS.accent} />
            <Text style={styles.subdivisionText}>
              {labelStyle === 'compact' ? 'Conf:' : 'Confidence:'} {String(gpsConfidence).toUpperCase()}
              {Number.isFinite(Number(gpsConfidenceScore)) ? ` (${Math.round(Number(gpsConfidenceScore))}%)` : ''}
            </Text>
          </View>
        )}
      </View>

      {heading !== null && (
        <View style={styles.compass}>
          <Ionicons 
            name="compass" 
            size={20} 
            color={COLORS.accent} 
            style={{ transform: [{ rotate: `${heading}deg` }] }}
          />
          <Text style={styles.compassText}>{getCompassDirection(heading)}</Text>
          {speed !== null && (
            <Text style={styles.speedText}>{speed.toFixed(1)} mph</Text>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 54,
    right: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: 6,
    paddingHorizontal: 8,
    minWidth: 130,
    maxWidth: 150,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
    ...SHADOWS.lg,
  },
  mainDisplay: {
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  label: {
    fontSize: 10,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
  },
  milepost: {
    fontSize: 20,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.text,
    marginTop: 2,
  },
  separator: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.sm,
  },
  trackInfo: {
    marginBottom: SPACING.xs,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  trackText: {
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.text,
    marginLeft: SPACING.xs,
  },
  subdivisionText: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginLeft: SPACING.xs,
  },
  compass: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  compassText: {
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.text,
    marginLeft: SPACING.xs,
  },
  speedText: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginLeft: SPACING.sm,
  },
});

export default MilepostDisplay;
