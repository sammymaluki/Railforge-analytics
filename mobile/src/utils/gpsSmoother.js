/**
 * GPS Smoothing & Filtering Utility
 * Reduces GPS jitter especially important for iOS
 */
import logger from './logger';
import featureFlags from './featureFlags';

class GPSSmoother {
  constructor(windowSize = 5) {
    this.windowSize = windowSize;
    this.locationHistory = [];
    this.lastValidLocation = null;
    this.lastUpdateTime = null;
  }

  /**
   * Add a new GPS location and get smoothed result
   */
  smoothLocation(rawLocation) {
    try {
      const now = Date.now();
      
      // Extract coordinates and accuracy
      const newPoint = {
        latitude: rawLocation.coords.latitude,
        longitude: rawLocation.coords.longitude,
        altitude: this.normalizeNumber(rawLocation.coords.altitude, 0),
        accuracy: this.normalizeNonNegative(rawLocation.coords.accuracy, 999),
        speed: this.normalizeNonNegative(rawLocation.coords.speed, 0),
        heading: this.normalizeHeading(rawLocation.coords.heading),
        timestamp: rawLocation.timestamp || now,
      };

      // Validate the new point
      if (!this.isValidLocation(newPoint)) {
        logger.warn('GPS', 'Invalid location detected, using last valid', {
          accuracy: newPoint.accuracy,
          coords: `${newPoint.latitude}, ${newPoint.longitude}`,
        });
        return this.lastValidLocation || newPoint;
      }

      // Check for GPS jump (teleportation detection)
      if (this.lastValidLocation) {
        const distance = this.calculateDistance(
          this.lastValidLocation.latitude,
          this.lastValidLocation.longitude,
          newPoint.latitude,
          newPoint.longitude
        );

        const timeDelta = (newPoint.timestamp - this.lastUpdateTime) / 1000; // seconds
        const speed = distance / timeDelta; // meters/second
        const maxReasonableSpeed = 33.5; // 120 km/h = 33.5 m/s (trains can go fast!)

        if (speed > maxReasonableSpeed && distance > 100) { 
          logger.warn('GPS', 'GPS jump detected, ignoring point', {
            distance: `${distance.toFixed(2)}m`,
            speed: `${speed.toFixed(2)}m/s`,
            timeDelta: `${timeDelta.toFixed(2)}s`,
          });
          return this.lastValidLocation;
        }
      }

      // Add to history
      this.locationHistory.push(newPoint);
      
      // Keep only last N points
      if (this.locationHistory.length > this.windowSize) {
        this.locationHistory.shift();
      }

      // Calculate smoothed location
      const smoothed = this.calculateSmoothedLocation();
      
      // Update last valid location
      this.lastValidLocation = smoothed;
      this.lastUpdateTime = now;

      return smoothed;
    } catch (error) {
      logger.error('GPS', 'Smoothing failed', error);
      return rawLocation;
    }
  }

  normalizeNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  normalizeNonNegative(value, fallback = 0) {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) return fallback;
    return num;
  }

  normalizeHeading(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) return null;
    if (num > 360) return num % 360;
    return num;
  }

  /**
   * Calculate smoothed location using weighted average
   * More recent locations have higher weight
   * Higher accuracy locations have higher weight
   */
  calculateSmoothedLocation() {
    if (this.locationHistory.length === 0) {
      return null;
    }

    if (this.locationHistory.length === 1) {
      return this.locationHistory[0];
    }

    // Check if smoothing is enabled in feature flags
    const smoothingEnabled = featureFlags.isEnabled('gpsSmoothingEnabled');
    if (!smoothingEnabled) {
      return this.locationHistory[this.locationHistory.length - 1];
    }

    let totalWeight = 0;
    let weightedLat = 0;
    let weightedLon = 0;
    let weightedAlt = 0;
    let bestAccuracy = 999;

    this.locationHistory.forEach((point, index) => {
      // Recency weight: more recent = higher weight
      const recencyWeight = (index + 1) / this.locationHistory.length;
      
      // Accuracy weight: better accuracy = higher weight
      // Invert accuracy so lower is better
      const accuracyWeight = 1 / Math.max(point.accuracy, 1);
      
      // Combined weight
      const weight = recencyWeight * accuracyWeight;
      
      weightedLat += point.latitude * weight;
      weightedLon += point.longitude * weight;
      weightedAlt += point.altitude * weight;
      totalWeight += weight;
      
      bestAccuracy = Math.min(bestAccuracy, point.accuracy);
    });

    // Get most recent point for speed/heading (can't average these)
    const latestPoint = this.locationHistory[this.locationHistory.length - 1];

    return {
      latitude: weightedLat / totalWeight,
      longitude: weightedLon / totalWeight,
      altitude: weightedAlt / totalWeight,
      accuracy: bestAccuracy,
      speed: latestPoint.speed,
      heading: latestPoint.heading,
      timestamp: latestPoint.timestamp,
      smoothed: true,
      sampleSize: this.locationHistory.length,
    };
  }

  /**
   * Validate location is reasonable
   */
  isValidLocation(point) {
    // Check latitude/longitude bounds
    if (point.latitude < -90 || point.latitude > 90) return false;
    if (point.longitude < -180 || point.longitude > 180) return false;
    
    // Check accuracy (iOS sometimes gives -1)
    if (point.accuracy <= 0) return false;
    
    // Check if accuracy is extremely poor (> 100m probably not useful)
    // But don't reject if it's the only point we have
    if (point.accuracy > 100 && this.lastValidLocation) return false;
    
    return true;
  }

  /**
   * Calculate distance between two points (Haversine formula)
   * Returns distance in meters
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Get GPS quality indicator
   */
  getQualityIndicator(accuracy) {
    if (accuracy < 0) return { level: 'none', text: 'No GPS', color: '#FF0000' };
    if (accuracy <= 10) return { level: 'excellent', text: 'Excellent', color: '#00FF00' };
    if (accuracy <= 20) return { level: 'good', text: 'Good', color: '#7FFF00' };
    if (accuracy <= 50) return { level: 'fair', text: 'Fair', color: '#FFFF00' };
    if (accuracy <= 100) return { level: 'poor', text: 'Poor', color: '#FFA500' };
    return { level: 'degraded', text: 'Degraded', color: '#FF0000' };
  }

  /**
   * Reset smoother (useful when starting new authority)
   */
  reset() {
    this.locationHistory = [];
    this.lastValidLocation = null;
    this.lastUpdateTime = null;
    logger.info('GPS', 'Smoother reset');
  }

  /**
   * Get current history size
   */
  getHistorySize() {
    return this.locationHistory.length;
  }

  /**
   * Get statistics about GPS quality
   */
  getStats() {
    if (this.locationHistory.length === 0) {
      return null;
    }

    const accuracies = this.locationHistory.map(p => p.accuracy);
    const avgAccuracy = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
    const minAccuracy = Math.min(...accuracies);
    const maxAccuracy = Math.max(...accuracies);

    return {
      sampleSize: this.locationHistory.length,
      avgAccuracy: avgAccuracy.toFixed(2),
      minAccuracy: minAccuracy.toFixed(2),
      maxAccuracy: maxAccuracy.toFixed(2),
      quality: this.getQualityIndicator(avgAccuracy),
    };
  }
}

// Export class for creating multiple instances if needed
export default GPSSmoother;

// Also export a singleton instance
export const globalGPSSmoother = new GPSSmoother(5);
