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
  numCells: 5000, // 3-4x more cells (smaller tiles)
  relaxationSteps: 5, // Increased to 5 for higher plains regularization
  seaLevel: 0.15,
  noiseScale: 0.8, // Lower frequency = larger continents and oceans
  mergeThreshold: 1, // Edge size threshold (degrees) below which vertices are collapsed
};

export function generatePlanetMap(customConfig?: MapConfig): PlanetMap {
  const config = { ...DEFAULT_CONFIG, ...customConfig };

  const simplex = new SimplexNoise();

  function getNoise(lon: number, lat: number): number {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);

    // Base 3D coordinates on the sphere
    const x = Math.sin(phi) * Math.cos(theta);
    const y = Math.cos(phi);
    const z = Math.sin(phi) * Math.sin(theta);

    // Octave 1: Low frequency, high amplitude (Defines continent shapes & coastline bounds)
    const f1 = config.noiseScale; // 0.8
    const n1 = simplex.noise3D(x * f1, y * f1, z * f1);

    // Octave 2: Medium frequency, medium amplitude (Defines regional land features & mountain ranges)
    const f2 = f1 * 3.0; // 2.4
    const n2 = simplex.noise3D(x * f2, y * f2, z * f2);

    // Octave 3: High frequency, low amplitude (Defines local ruggedness, cliffs, & valley detail)
    const f3 = f1 * 7.5; // 6.0
    const n3 = simplex.noise3D(x * f3, y * f3, z * f3);

    // Octave 4: Ultra-high frequency, very low amplitude (Defines extreme micro-ruggedness, isolated spiky hills & peaks)
    const f4 = f1 * 18.0; // 14.4
    const n4 = simplex.noise3D(x * f4, y * f4, z * f4);

    // Weighted Fractal Brownian Motion combination
    const totalNoise = (1.0 * n1 + 0.38 * n2 + 0.12 * n3 + 0.05 * n4) / (1.0 + 0.38 + 0.12 + 0.05);
    return totalNoise;
  }

  // Helpers for polar-safe 3D Cartesian interpolation
  function toCartesian(lon: number, lat: number): [number, number, number] {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    return [Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)];
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

  // A secondary, low-frequency + high-frequency simplex noise to dictate "regional regularity"
  // (0.0 = highly chaotic plains, 1.0 = highly structured grid plains)
  function getRegionalRegularity(lon: number, lat: number): number {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    const x = Math.sin(phi) * Math.cos(theta);
    const y = Math.cos(phi);
    const z = Math.sin(phi) * Math.sin(theta);

    // Octave 1: Broad regional order waves
    const n1 = simplex.noise3D(x * 0.65, y * 0.65, z * 0.65);

    // Octave 2: Local detailed pockets of order/chaos (inconsistency inside continents)
    const n2 = simplex.noise3D(x * 2.5, y * 2.5, z * 2.5);

    const combined = (1.0 * n1 + 0.45 * n2) / 1.45;
    return (combined + 1) / 2; // Normalize to [0, 1]
  }

  // Continuous spatial weight calculator based on elevation and regional regularity
  function getRegularityWeight(lon: number, lat: number): number {
    const elevation = getNoise(lon, lat);
    const reg = getRegionalRegularity(lon, lat);

    if (elevation <= config.seaLevel) {
      return 0.3 * (1 - reg) + 0.6 * reg; // Ocean gets moderate relaxation based on regularity
    }

    const heightAboveSea = elevation - config.seaLevel;
    if (heightAboveSea > 0.4) {
      return 0.05; // Mountains: very low weight means they stay dense and jagged
    } else {
      // Plains, Desert, Tundra: transitions from 1.0 (fully relaxed hexagons) to 0.05 (jagged)
      const t = heightAboveSea / 0.4;
      const baseW = 1.0 * (1 - t) + 0.05 * t;
      // Modulate by regional regularity (chaotic regions are relaxed far less)
      return baseW * (0.08 * (1 - reg) + 1.0 * reg);
    }
  }

  // 1. Initial point distribution (Fibonacci Sphere with modulated Jitter & Rejection Sampling)
  const goldenRatio = (1 + Math.sqrt(5)) / 2;
  const candidates: [number, number][] = [];

  // Use a fixed global candidate pool size to guarantee uniform coverage of both poles
  const N_candidates = Math.round(config.numCells * 3.5);

  for (let idx = 0; idx < N_candidates; idx++) {
    // Standard polar Fibonacci distribution
    const latRad = Math.asin(-1 + (2 * idx) / N_candidates);
    const lonRad = (2 * Math.PI * idx) / goldenRatio;

    let lon = (lonRad * 180) / Math.PI;
    let lat = (latRad * 180) / Math.PI;

    // Normalize longitude
    lon = ((lon + 180) % 360) - 180;
    if (lon < -180) lon += 360;

    const elevation = getNoise(lon, lat);

    // Solve polar cell enormity by forcing high density near both poles (|lat| > 70)
    const isPolar = Math.abs(lat) > 70;
    const densityProbability = isPolar ? 0.95 : elevation > config.seaLevel ? 0.95 : 0.12;

    if (Math.random() < densityProbability) {
      const reg = getRegionalRegularity(lon, lat);

      // Modulate jitter scale based on elevation and regional regularity
      const baseJitter = 1.3 * (1 - reg) + 0.05 * reg;
      let jitterScale = baseJitter;

      if (elevation > config.seaLevel) {
        const heightAboveSea = elevation - config.seaLevel;
        if (heightAboveSea > 0.4) {
          // Mountains get heavy jitter to randomize completely
          jitterScale = 1.6;
        } else {
          // Interpolate smoothly between base plains jitter and mountains jitter
          const t = heightAboveSea / 0.4;
          jitterScale = baseJitter * (1 - t) + 1.6 * t;
        }
      } else {
        // Ocean gets some moderate, organic jitter
        jitterScale = 0.5 * (1 - reg) + 0.2 * reg;
      }

      if (jitterScale > 0) {
        lon += (Math.random() - 0.5) * jitterScale;
        lat += (Math.random() - 0.5) * jitterScale;
        // Keep lat within safe bounds
        lat = Math.min(Math.max(lat, -89.9), 89.9);
      }

      candidates.push([lon, lat]);
    }
  }

  // Fisher-Yates shuffle to downsample candidates to exactly the requested cell count,
  // ensuring unbiased polar density is perfectly preserved at both poles.
  function shuffle<T>(array: T[]): T[] {
    for (let j = array.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      const temp = array[j];
      array[j] = array[k];
      array[k] = temp;
    }
    return array;
  }

  const shuffledCandidates = shuffle(candidates);
  let sites = shuffledCandidates.slice(0, Math.min(config.numCells, shuffledCandidates.length));

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

  // 2.5 Size-Limiting Cell Splitting Pass
  // Calculate current cell areas to identify oversized cells
  let currentVoronoi = d3.geoVoronoi().polygons(sites);
  let areas = currentVoronoi.features.map((feature: any) => d3.geoArea(feature));

  // Find median area
  const sortedAreas = [...areas].sort((a, b) => a - b);
  const medianArea = sortedAreas[Math.floor(sortedAreas.length / 2)];

  // Calculate standard deviation of areas
  const meanArea = areas.reduce((sum, a) => sum + a, 0) / areas.length;
  const variance = areas.reduce((sum, a) => sum + Math.pow(a - meanArea, 2), 0) / areas.length;
  const stdDevArea = Math.sqrt(variance);

  const sizeLimit = medianArea + stdDevArea;

  let splitSites: [number, number][] = [];
  let splitCount = 0;

  for (let j = 0; j < sites.length; j++) {
    const site = sites[j];
    const area = areas[j];

    if (area > sizeLimit) {
      const lon = site[0];
      const lat = site[1];
      const offset = 0.35; // Slight offset to split the cell seed

      const s1: [number, number] = [
        Math.min(Math.max(lon - offset, -180), 180),
        Math.min(Math.max(lat - offset, -89.9), 89.9),
      ];
      const s2: [number, number] = [
        Math.min(Math.max(lon + offset, -180), 180),
        Math.min(Math.max(lat + offset, -89.9), 89.9),
      ];

      splitSites.push(s1, s2);
      splitCount++;
    } else {
      splitSites.push(site);
    }
  }

  sites = splitSites;

  // Run 2 extra relaxation steps on the split sites to smooth out the new cells seamlessly
  if (splitCount > 0) {
    for (let step = 0; step < 2; step++) {
      const voronoi = d3.geoVoronoi().polygons(sites);
      sites = voronoi.features.map((feature: any, index: number) => {
        const centroid = d3.geoCentroid(feature) as [number, number];
        const original = sites[index];
        const w = getRegularityWeight(original[0], original[1]);

        const c1 = toCartesian(original[0], original[1]);
        const c2 = toCartesian(centroid[0], centroid[1]);

        const x = (1 - w) * c1[0] + w * c2[0];
        const y = (1 - w) * c1[1] + w * c2[1];
        const z = (1 - w) * c1[2] + w * c2[2];

        return toSpherical(x, y, z);
      });
    }
  }

  // Generate final baseline Voronoi mesh
  const finalVoronoi = d3.geoVoronoi().polygons(sites);

  // 3. Topology Pass: Classify Landmasess
  const isLand = sites.map((site) => getNoise(site[0], site[1]) > config.seaLevel);

  // 5. Construct Cell objects, calculate area, and classify biomes & difficulty
  const mergedVertices: [number, number][] = [];
  function getMergedPoint(pt: [number, number]): [number, number] {
    for (const v of mergedVertices) {
      const dist = Math.hypot(v[0] - pt[0], v[1] - pt[1]);
      if (dist < config.mergeThreshold) {
        return v; // Snap to existing merged vertex
      }
    }
    mergedVertices.push(pt);
    return pt;
  }

  const cells: Cell[] = finalVoronoi.features.map((feature: any, index: number) => {
    const centroid = sites[index];
    const elevation = getNoise(centroid[0], centroid[1]);
    const land = isLand[index];

    // Deep copy coordinates to preserve original unmerged geometry references
    const originalCoordinates = feature.geometry.coordinates.map((ring: [number, number][]) => {
      return ring.map((pt: [number, number]) => [pt[0], pt[1]] as [number, number]);
    });

    // Reconstruct coordinates by mapping and snapping every vertex to ensure clean coordinate copying
    const coordinates = feature.geometry.coordinates.map((ring: [number, number][]) => {
      return ring.map((pt: [number, number]) => getMergedPoint(pt));
    });

    // Calculate spherical area using d3.geoArea on the newly merged coordinates
    const area = d3.geoArea({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates,
      },
    });

    // Traversal difficulty is 1 / area (capped to avoid extreme infinity or division errors)
    const difficulty = 1.0 / Math.max(area, 0.000001);

    // Neighbors extracted from properties
    const neighbors: number[] = feature.properties.neighbours || feature.properties.neighbors || [];

    // Classify Biome inspired from Civilization (Snow, Tundra, Mountain, Hills, Desert, Grassland, Marsh, Plains)
    // Completely driven by our unified 4-octave elevation noise and latitude!
    let biome = 'Deep Ocean';

    if (land) {
      const absLat = Math.abs(centroid[1]);
      if (absLat > 80) {
        biome = 'Snow'; // Extremely cold polar regions
      } else if (absLat > 62) {
        biome = 'Tundra'; // Cold subpolar regions
      } else if (elevation > config.seaLevel + 0.4) {
        biome = 'Mountain'; // High altitude peaks (Octave 4 generates spiky unexpected peaks!)
      } else if (elevation > config.seaLevel + 0.22) {
        biome = 'Hills'; // Moderate rolling hills (Octave 4 generates isolated hill pockets!)
      } else if (absLat < 22 && elevation < config.seaLevel + 0.18) {
        biome = 'Desert'; // Warm arid bands near equator
      } else if (absLat < 55 && elevation < config.seaLevel + 0.035) {
        biome = 'Marsh'; // Low-lying, fresh-water wetland bogs situated in geological depressions
      } else if (absLat < 48 && elevation < config.seaLevel + 0.12) {
        biome = 'Grassland'; // Lush temperate well-watered zones
      } else {
        biome = 'Plains'; // Standard temperate flat plains
      }
    }

    return {
      id: index,
      centroid,
      elevation,
      biome,
      isLand: land,
      isCoast: false, // Default to false, classified dynamically in the vertex-sharing coast pass!
      neighbors,
      coordinates, // Pass the newly constructed, cleanly merged coordinates array!
      originalCoordinates, // Store original coordinates for accurate topological pruning
      area,
      difficulty,
      riverConnections: [], // Default initialization of centroid-to-centroid river connections
    };
  });

  // 5.5 Prune Collapsed Graph Edges
  // Delaunay neighbor lists can contain non-adjacent Voronoi cells.
  // To identify if they share a valid, uncollapsed solid boundary, we locate their original shared vertices.
  // If their original boundary endpoints have collapsed to the same single point (merged distance < 0.01 degrees),
  // we prune the neighbor connection completely. This prevents false neighbor connections from global vertex merges.
  cells.forEach((cellA) => {
    cellA.neighbors = cellA.neighbors.filter((neighborId) => {
      const cellB = cells[neighborId];
      if (!cellB) return false;

      // Find shared vertices in the original, unmerged polygon geometries
      const ringA = (cellA.originalCoordinates[0] || []).slice(0, -1);
      const ringB = (cellB.originalCoordinates[0] || []).slice(0, -1);

      const sharedOrig: [number, number][] = [];
      for (const pt1 of ringA) {
        const isShared = ringB.some((pt2) => Math.hypot(pt1[0] - pt2[0], pt1[1] - pt2[1]) < 0.001);
        if (isShared) {
          sharedOrig.push(pt1);
        }
      }

      // If they originally shared fewer than 2 vertices, they were never adjacent Voronoi neighbors
      if (sharedOrig.length < 2) return false;

      // Find the two extreme original shared vertices (the original edge endpoints)
      let maxDist = -1;
      let p1_orig = sharedOrig[0];
      let p2_orig = sharedOrig[1];

      for (let a = 0; a < sharedOrig.length; a++) {
        for (let b = a + 1; b < sharedOrig.length; b++) {
          const dist = Math.hypot(
            sharedOrig[a][0] - sharedOrig[b][0],
            sharedOrig[a][1] - sharedOrig[b][1],
          );
          if (dist > maxDist) {
            maxDist = dist;
            p1_orig = sharedOrig[a];
            p2_orig = sharedOrig[b];
          }
        }
      }

      // Track down where these original endpoints mapped to in our merged geometry
      const p1_merged = getMergedPoint(p1_orig);
      const p2_merged = getMergedPoint(p2_orig);

      // If their distance after merging is practically zero, their shared edge collapsed!
      const mergedDist = Math.hypot(p1_merged[0] - p2_merged[0], p1_merged[1] - p2_merged[1]);
      return mergedDist >= 0.01; // Prune connection if they collapsed (mergedDist < 0.01)
    });
  });

  // 5.6 Vertex-Sharing Coast Pass
  // To guarantee a complete, unbroken ring of coastal cells around all landmasses,
  // no land cell is allowed to touch a deep ocean cell (not even at a single vertex point).
  // We collect all vertex coordinates of land cells, and classify any adjacent water cells sharing a vertex as Coast.
  const landVertices = new Set<string>();
  cells.forEach((cell) => {
    if (cell.isLand) {
      const ring = cell.coordinates[0] || [];
      ring.forEach((pt) => {
        landVertices.add(`${pt[0].toFixed(4)},${pt[1].toFixed(4)}`);
      });
    }
  });

  cells.forEach((cell) => {
    if (!cell.isLand) {
      const ring = cell.coordinates[0] || [];
      const sharesVertexWithLand = ring.some((pt) => {
        return landVertices.has(`${pt[0].toFixed(4)},${pt[1].toFixed(4)}`);
      });

      if (sharesVertexWithLand) {
        cell.isCoast = true;
        cell.biome = 'Shallow Coast';
      }
    }
  });

  // 6. Topological River Generation Pass (flows uphill from coasts, branching organically)
  // Rivers flow directly between the midpoints (centroids) of adjacent cells,
  // completely bypassing edge midpoints and guaranteeing that rivers never touch or cross polygon corners!
  const maxRiverLength = 15;

  function traceRiver(currentCell: Cell, visited: Set<number>, depth: number) {
    if (depth >= maxRiverLength) return;

    // Find uphill land neighbors (isLand = true, not visited, elevation >= current)
    const uphillCandidates = currentCell.neighbors
      .map((nIndex) => cells[nIndex])
      .filter(
        (n): n is Cell =>
          n !== undefined && n.isLand && !visited.has(n.id) && n.elevation >= currentCell.elevation,
      );

    if (uphillCandidates.length === 0) return;

    // Split check: 15% probability of splitting into 2 uphill branches if multiple candidates are available
    let chosenNeighbors: Cell[] = [];
    if (uphillCandidates.length >= 2 && Math.random() < 0.15) {
      const idx1 = Math.floor(Math.random() * uphillCandidates.length);
      let idx2 = Math.floor(Math.random() * uphillCandidates.length);
      while (idx2 === idx1) {
        idx2 = Math.floor(Math.random() * uphillCandidates.length);
      }
      chosenNeighbors = [uphillCandidates[idx1], uphillCandidates[idx2]];
    } else {
      const idx = Math.floor(Math.random() * uphillCandidates.length);
      chosenNeighbors = [uphillCandidates[idx]];
    }

    chosenNeighbors.forEach((neighbor) => {
      visited.add(neighbor.id);

      // Record direct topological connection: currentCell flows into neighbor
      currentCell.riverConnections.push(neighbor.id);

      // Trace recursively uphill
      traceRiver(neighbor, visited, depth + 1);
    });
  }

  // Start 25 rivers across the globe (dense maps need slightly more starting mouths)
  const numRiversToStart = 25;
  const coastCells = cells.filter((c) => c.isCoast);

  // Quick shuffle
  const shuffledCoast = [...coastCells].sort(() => Math.random() - 0.5);
  const startingMouths = shuffledCoast.slice(0, Math.min(numRiversToStart, shuffledCoast.length));

  const globalVisited = new Set<number>();

  startingMouths.forEach((mouth) => {
    globalVisited.add(mouth.id);
    traceRiver(mouth, globalVisited, 1);
  });

  return new PlanetMap(cells);
}
