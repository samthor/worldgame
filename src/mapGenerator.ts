import { Cell } from './types.js';
import { PlanetMap } from './planetMap.js';

export interface MapConfig {
  numCells?: number;
  relaxationSteps?: number;
  seaLevel?: number;
  noiseScale?: number;
  mergeThreshold?: number;
}

const DEFAULT_CONFIG: Required<MapConfig> = {
  numCells: 1500,
  relaxationSteps: 5, // Increased to 5 for higher plains regularization
  seaLevel: 0.15,
  noiseScale: 1.5,
  mergeThreshold: 1.2
};

export function generatePlanetMap(customConfig?: MapConfig): PlanetMap {
  const config = { ...DEFAULT_CONFIG, ...customConfig };
  
  const simplex = new SimplexNoise();

  function getNoise(lon: number, lat: number): number {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    const x = Math.sin(phi) * Math.cos(theta);
    const y = Math.cos(phi);
    const z = Math.sin(phi) * Math.sin(theta);
    return simplex.noise3D(x * config.noiseScale, y * config.noiseScale, z * config.noiseScale);
  }

  // Helpers for polar-safe 3D Cartesian interpolation
  function toCartesian(lon: number, lat: number): [number, number, number] {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    return [
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta)
    ];
  }

  function toSpherical(x: number, y: number, z: number): [number, number] {
    const r = Math.hypot(x, y, z);
    if (r === 0) return [0, 0];
    const lat = 90 - (Math.acos(y / r) * 180) / Math.PI;
    let lon = (Math.atan2(z, x) * 180) / Math.PI - 180;
    if (lon < -180) lon += 360;
    if (lon > 180) lon -= 360;
    return [lon, lat];
  }

  // Continuous spatial weight calculator based on elevation
  function getRegularityWeight(lon: number, lat: number): number {
    const elevation = getNoise(lon, lat);
    if (elevation <= config.seaLevel) {
      return 0.5; // Ocean/Coast gets moderate relaxation
    }
    
    const heightAboveSea = elevation - config.seaLevel;
    if (heightAboveSea > 0.4) {
      return 0.05; // Mountains: very low weight means they stay dense and jagged
    } else {
      // Plains, Desert, Tundra: transitions from 1.0 (fully relaxed hexagons) to 0.05 (jagged)
      const t = heightAboveSea / 0.4;
      return 1.0 * (1 - t) + 0.05 * t;
    }
  }

  // 1. Initial point distribution (Rejection Sampling)
  let sites: [number, number][] = [];
  while (sites.length < config.numCells) {
    const lon = Math.random() * 360 - 180;
    const lat = (Math.asin(Math.random() * 2 - 1) * 180) / Math.PI;
    const elevation = getNoise(lon, lat);
    const densityProbability = elevation > config.seaLevel ? 0.9 : 0.1;

    if (Math.random() < densityProbability) {
      sites.push([lon, lat]);
    }
  }

  // 2. Spatially-Varying Lloyd's Relaxation Loop
  for (let step = 0; step < config.relaxationSteps; step++) {
    const voronoi = d3.geoVoronoi().polygons(sites);
    sites = voronoi.features.map((feature: any, index: number) => {
      const centroid = d3.geoCentroid(feature) as [number, number];
      const original = sites[index];
      
      const w = getRegularityWeight(original[0], original[1]);
      
      // Interpolate in 3D Cartesian coordinates to prevent wrap-around & polar issues
      const c1 = toCartesian(original[0], original[1]);
      const c2 = toCartesian(centroid[0], centroid[1]);
      
      const x = (1 - w) * c1[0] + w * c2[0];
      const y = (1 - w) * c1[1] + w * c2[1];
      const z = (1 - w) * c1[2] + w * c2[2];
      
      return toSpherical(x, y, z);
    });
  }

  // Generate final baseline Voronoi mesh
  const finalVoronoi = d3.geoVoronoi().polygons(sites);

  // 3. Topology Pass: Classify Land vs Adjacency Coastlines
  const isLand = sites.map((site) => getNoise(site[0], site[1]) > config.seaLevel);
  const isCoast = new Array(config.numCells).fill(false);

  finalVoronoi.features.forEach((feature: any, index: number) => {
    if (!isLand[index]) {
      // If this water cell shares an edge with ANY land cell, it is Coast
      const neighbors: number[] | undefined =
        feature.properties.neighbours || feature.properties.neighbors;
      if (neighbors && neighbors.some((nIndex) => isLand[nIndex])) {
        isCoast[index] = true;
      }
    }
  });

  // 4. Vertex Merging (Edge Collapse)
  // Find vertices that are extremely close to each other and snap them to a single point.
  const mergedVertices: [number, number][] = [];
  function getMergedPoint(pt: [number, number]): [number, number] {
    for (const v of mergedVertices) {
      // Calculate rough spherical distance
      const dist = Math.hypot(v[0] - pt[0], v[1] - pt[1]);
      if (dist < config.mergeThreshold) {
        return v; // Snap to existing merged vertex
      }
    }
    mergedVertices.push(pt);
    return pt;
  }

  finalVoronoi.features.forEach((feature: any) => {
    // geoVoronoi returns Polygon geometries. Coordinates are nested arrays.
    feature.geometry.coordinates.forEach((ring: [number, number][]) => {
      for (let i = 0; i < ring.length; i++) {
        ring[i] = getMergedPoint(ring[i]);
      }
    });
  });

  // 5. Construct Cell objects, calculate area, and classify biomes & difficulty
  const cells: Cell[] = finalVoronoi.features.map((feature: any, index: number) => {
    const centroid = sites[index];
    const elevation = getNoise(centroid[0], centroid[1]);
    const land = isLand[index];
    const coast = isCoast[index];

    // Calculate spherical area using d3.geoArea
    const area = d3.geoArea(feature);
    
    // Traversal difficulty is 1 / area (capped to avoid extreme infinity or division errors)
    const difficulty = 1.0 / Math.max(area, 0.000001);

    // Neighbors extracted from properties
    const neighbors: number[] = feature.properties.neighbours || feature.properties.neighbors || [];

    // Classify Biome
    let biome = 'Deep Ocean';
    if (land) {
      const absLat = Math.abs(centroid[1]);
      if (absLat > 65) {
        biome = 'Tundra';
      } else if (elevation > config.seaLevel + 0.4) {
        biome = 'Mountain';
      } else if (absLat < 20 && elevation < config.seaLevel + 0.2) {
        biome = 'Desert';
      } else {
        biome = 'Plains';
      }
    } else if (coast) {
      biome = 'Shallow Coast';
    }

    return {
      id: index,
      centroid,
      elevation,
      biome,
      isLand: land,
      isCoast: coast,
      neighbors,
      coordinates: feature.geometry.coordinates,
      area,
      difficulty
    };
  });

  return new PlanetMap(cells);
}
