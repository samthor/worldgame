import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as d3Base from 'd3';
import { geoVoronoi } from 'd3-geo-voronoi';
import SimplexNoise from 'simplex-noise';

// Extend d3 with geoVoronoi to maintain compatibility with existing code
export const d3 = {
  ...d3Base,
  geoVoronoi
};

export { THREE, OrbitControls, SimplexNoise };
