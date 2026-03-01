/**
 * GPS Accuracy Indicator Component
 * Shows GPS signal quality to users (important for iOS transparency)
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, FONT_SIZES } from '../../constants/theme';

const GPSAccuracyIndicator = ({ accuracy, show = true }) => {
  if (!show) return null;

  const formatAccuracyText = (meters) => {
    const feet = meters * 3.28084;
    return `±${meters.toFixed(0)}m / ${feet.toFixed(0)}ft`;
  };

  const getAccuracyLevel = () => {
    if (accuracy === null || accuracy === undefined || accuracy < 0) {
      return {
        level: 'none',
        text: 'No GPS',
        color: '#FF0000',
        icon: 'crosshairs-off',
        bars: 0,
      };
    }
    
    if (accuracy <= 10) {
      return {
        level: 'excellent',
        text: formatAccuracyText(accuracy),
        color: '#00FF00',
        icon: 'crosshairs-gps',
        bars: 5,
      };
    }
    
    if (accuracy <= 20) {
      return {
        level: 'good',
        text: formatAccuracyText(accuracy),
        color: '#7FFF00',
        icon: 'crosshairs-gps',
        bars: 4,
      };
    }
    
    if (accuracy <= 50) {
      return {
        level: 'fair',
        text: formatAccuracyText(accuracy),
        color: '#FFFF00',
        icon: 'crosshairs',
        bars: 3,
      };
    }
    
    if (accuracy <= 100) {
      return {
        level: 'poor',
        text: formatAccuracyText(accuracy),
        color: '#FFA500',
        icon: 'crosshairs',
        bars: 2,
      };
    }
    
    return {
      level: 'degraded',
      text: formatAccuracyText(accuracy),
      color: '#FF0000',
      icon: 'crosshairs',
      bars: 1,
    };
  };

  const accuracyInfo = getAccuracyLevel();

  return (
    <View style={styles.container}>
      <View style={[styles.indicator, { backgroundColor: accuracyInfo.color + '20' }]}>
        <MaterialCommunityIcons 
          name={accuracyInfo.icon} 
          size={16} 
          color={accuracyInfo.color} 
        />
        <View style={styles.barsContainer}>
          {[1, 2, 3, 4, 5].map((bar) => (
            <View
              key={bar}
              style={[
                styles.bar,
                { 
                  backgroundColor: bar <= accuracyInfo.bars ? accuracyInfo.color : '#444',
                  height: bar * 3 + 2,
                },
              ]}
            />
          ))}
        </View>
        <Text style={[styles.text, { color: accuracyInfo.color }]}>
          {accuracyInfo.text}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    right: 10,
    zIndex: 10,
  },
  indicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginLeft: 6,
    marginRight: 6,
    gap: 2,
  },
  bar: {
    width: 3,
    borderRadius: 1,
  },
  text: {
    fontSize: FONT_SIZES.small,
    fontWeight: '600',
  },
});

export default GPSAccuracyIndicator;
