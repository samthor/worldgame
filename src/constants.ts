/**
 * Camera Tilt Configuration
 */
export const TILT_CONFIG = {
  DEFAULT_ANGLE: 0.15, // Small non-zero default tilt (radians)
  MAX_ANGLE: 1.1, // Maximum tilt (radians, less than PI/2)
  MIN_ANGLE: 0.0, // Minimum tilt
  SENSITIVITY: 0.0009,
  FRICTION: 0.92, // Decay factor for tilt velocity
  SPRING_K: 0.1, // Spring constant for returning from overshoot
  OVERSHOOT_MAX: 0.15, // How far past the limits we can 'fling'
  };

  /**
  * Camera Rotation Configuration
  */
  export const ROTATION_CONFIG = {
    MIN_DISTANCE: 1.25, // Closest zoom
    MAX_DISTANCE: 4.0,  // Standard zoom reference
    MIN_SPEED: 0.05,    // Rotation speed at closest zoom (Very slow for precision)
    MAX_SPEED: 0.8,     // Rotation speed at max zoom
  };

  export const TERRAIN_CONFIG = {
    ELEVATION_SCALE: 0.06, // Subtle elevation (was 0.15)
    SEA_LEVEL: 0.0,        // Base level for global oceans
  };
