import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from '../../constants/theme';

const BoundaryIndicator = ({ distanceToBegin, distanceToEnd, withinBoundaries }) => {
  const getAlertLevel = (distance) => {
    if (distance <= 0.25) return 'emergency';
    if (distance <= 0.5) return 'critical';
    if (distance <= 0.75) return 'warning';
    return 'normal';
  };

  const getAlertColor = (level) => {
    switch (level) {
      case 'emergency': return COLORS.alertEmergency;
      case 'critical': return COLORS.alertCritical;
      case 'warning': return COLORS.alertWarning;
      default: return COLORS.authorityActive;
    }
  };

  const beginLevel = getAlertLevel(distanceToBegin);
  const endLevel = getAlertLevel(distanceToEnd);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons 
          name={withinBoundaries ? "checkmark-circle" : "alert-circle"} 
          size={20} 
          color={withinBoundaries ? COLORS.authorityActive : COLORS.error} 
        />
        <Text style={styles.headerText}>
          {withinBoundaries ? 'Within Authority' : 'Outside Authority'}
        </Text>
      </View>

      <View style={styles.distanceRow}>
        <View style={[styles.distanceItem, { borderLeftColor: getAlertColor(beginLevel) }]}>
          <Text style={styles.distanceLabel}>To Begin</Text>
          <Text style={[styles.distanceValue, { color: getAlertColor(beginLevel) }]}>
            {distanceToBegin !== null ? `${distanceToBegin.toFixed(2)} mi` : '--'}
          </Text>
        </View>

        <View style={styles.divider} />

        <View style={[styles.distanceItem, { borderLeftColor: getAlertColor(endLevel) }]}>
          <Text style={styles.distanceLabel}>To End</Text>
          <Text style={[styles.distanceValue, { color: getAlertColor(endLevel) }]}>
            {distanceToEnd !== null ? `${distanceToEnd.toFixed(2)} mi` : '--'}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 74,
    left: SPACING.sm,
    right: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    ...SHADOWS.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  headerText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.text,
    marginLeft: SPACING.xs,
  },
  distanceRow: {
    flexDirection: 'row',
  },
  distanceItem: {
    flex: 1,
    borderLeftWidth: 3,
    paddingLeft: SPACING.xs,
  },
  distanceLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  distanceValue: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
  },
  divider: {
    width: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: SPACING.sm,
  },
});

export default BoundaryIndicator;
