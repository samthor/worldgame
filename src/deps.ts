import * as THREE from 'three/src/Three.js'; // import as ESM
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as d3Base from 'd3';
import { geoVoronoi } from 'd3-geo-voronoi';
import SimplexNoise from 'simplex-noise';

// Extend d3 with geoVoronoi to maintain compatibility with existing code
export const d3 = {
  ...d3Base,
  geoVoronoi,
};

export {
  THREE,
  OrbitControls,
  MapControls,
  SimplexNoise,
  EffectComposer,
  RenderPass,
  ShaderPass,
  OutputPass,
};
