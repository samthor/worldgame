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
  OVERSHOOT_MAX: 0.02, // How far past the limits we can 'fling'
};
