import { THREE } from './deps.js';

export interface BiomeVisuals {
  h: number; // HSL Hue (0-360)
  s: number; // HSL Saturation (0-100)
  l: number; // HSL Lightness (0-100)
}

export const BIOME_COLORS: Record<string, BiomeVisuals> = {
  'Snow': { h: 210, s: 5, l: 95 },
  'Tundra': { h: 160, s: 10, l: 85 },
  'Mountain': { h: 240, s: 4, l: 70 },
  'Hills': { h: 110, s: 40, l: 65 },
  'Desert': { h: 42, s: 65, l: 78 },
  'Grassland': { h: 135, s: 65, l: 65 },
  'Marsh': { h: 100, s: 25, l: 45 },
  'Plains': { h: 80, s: 50, l: 65 },
  'Shallow Coast': { h: 210, s: 85, l: 55 },
  'Deep Ocean': { h: 215, s: 65, l: 15 },
};

/**
 * Helper to get biome visuals with a fallback.
 */
export function getBiomeVisuals(biomeName: string, isCoast: boolean = false): BiomeVisuals {
  if (isCoast) return BIOME_COLORS['Shallow Coast'];
  return BIOME_COLORS[biomeName] || BIOME_COLORS['Plains'];
}

/**
 * Helper to get HSL string for 2D Canvas.
 */
export function getBiomeHSL(biomeName: string, isCoast: boolean = false, lightnessMod: number = 1.0): string {
  const v = getBiomeVisuals(biomeName, isCoast);
  return `hsl(${v.h}, ${v.s}%, ${Math.round(v.l * lightnessMod)}%)`;
}

/**
 * Helper to get THREE.Color for 3D Geometry.
 * Converts HSL (0-360, 0-100, 0-100) to THREE's expected HSL (0-1, 0-1, 0-1).
 */
export function getBiomeTHREEColor(biomeName: string, isCoast: boolean = false): THREE.Color {
  const v = getBiomeVisuals(biomeName, isCoast);
  return new THREE.Color().setHSL(v.h / 360, v.s / 100, v.l / 100);
}
