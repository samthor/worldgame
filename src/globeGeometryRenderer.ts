import { THREE } from './deps.js';
import { PlanetMap } from './planetMap.js';
import { Cell } from './types.js';

import { getBiomeTHREEColor } from './biomes.js';

export class GlobeGeometryRenderer {
  private readonly planetMap: PlanetMap;
  private readonly elevationScale = 0.15; // How much elevation affects radius

  constructor(planetMap: PlanetMap) {
    this.planetMap = planetMap;
  }

  /**
   * Creates a single BufferGeometry representing all land and coast cells,
   * using "flat" (lon, lat, el) coordinates to be warped by a shader.
   */
  public createLandGeometry(): THREE.BufferGeometry {
    const positions: number[] = [];
    const colors: number[] = [];

    const landCells = this.planetMap.cells.filter((c) => c.isLand || c.isCoast);

    landCells.forEach((cell) => {
      const ring = (cell.coordinates[0] || []).slice(0, -1);
      if (ring.length < 3) return;

      const centroidPos = [cell.centroid[0], cell.centroid[1], cell.elevation];
      const cellColor = this.getBiomeColor(cell);

      // 1. Draw the "Cap"
      for (let i = 0; i < ring.length; i++) {
        const p1 = ring[i];
        const p2 = ring[(i + 1) % ring.length];

        // Store as [lon, lat, elevation]
        positions.push(
          ...centroidPos,
          p2[0], p2[1], cell.elevation,
          p1[0], p1[1], cell.elevation
        );
        colors.push(...cellColor, ...cellColor, ...cellColor);
      }

      // 2. Draw "Walls"
      cell.neighbors.forEach((neighborId) => {
        const neighbor = this.planetMap.getCell(neighborId);
        if (!neighbor) return;

        if (cell.elevation > neighbor.elevation) {
          const ringB = (neighbor.coordinates[0] || []).slice(0, -1);

          for (let i = 0; i < ring.length; i++) {
            const p1 = ring[i];
            const p2 = ring[(i + 1) % ring.length];

            const isP1Shared = ringB.some(ptB => Math.hypot(p1[0] - ptB[0], p1[1] - ptB[1]) < 0.001);
            const isP2Shared = ringB.some(ptB => Math.hypot(p2[0] - ptB[0], p2[1] - ptB[1]) < 0.001);

            if (isP1Shared && isP2Shared) {
              const wallColor = cellColor.map(c => c * 0.7);

              // Wall triangle 1
              positions.push(
                p1[0], p1[1], cell.elevation,
                p2[0], p2[1], cell.elevation,
                p1[0], p1[1], neighbor.elevation
              );
              // Wall triangle 2
              positions.push(
                p2[0], p2[1], cell.elevation,
                p2[0], p2[1], neighbor.elevation,
                p1[0], p1[1], neighbor.elevation
              );
              colors.push(...wallColor, ...wallColor, ...wallColor, ...wallColor, ...wallColor, ...wallColor);
            }
          }
        }
      });
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('vCellColor', new THREE.Float32BufferAttribute(colors, 3));

    return geometry;
  }

  /**
   * Creates a BufferGeometry representing the perimeter edges of all land/coast cells,
   * rendered as physical ribbons (quads) so they have thickness that scales with zoom.
   */
  public createEdgeGeometry(): THREE.BufferGeometry {
    const positions: number[] = [];
    const colors: number[] = [];

    const landCells = this.planetMap.cells.filter((c) => c.isLand || c.isCoast);
    const ribbonWidth = 0.012; // Dramatically thicker (approx 3.5x previous)

    landCells.forEach((cell) => {
      const ring = (cell.coordinates[0] || []).slice(0, -1);
      if (ring.length < 3) return;

      const cellColor = this.getBiomeColor(cell);

      for (let i = 0; i < ring.length; i++) {
        const p1 = ring[i];
        const p2 = ring[(i + 1) % ring.length];

        // 1. Calculate a 'side' offset vector in [lon, lat] space
        // This is a simplification: we just use the 2D perpendicular
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const len = Math.hypot(dx, dy);
        if (len === 0) continue;

        const ux = -dy / len;
        const uy = dx / len;

        const offX = ux * ribbonWidth;
        const offY = uy * ribbonWidth;

        // 2. Generate 4 vertices for the ribbon quad
        // Inner edge
        const v1 = [p1[0], p1[1], cell.elevation];
        const v2 = [p2[0], p2[1], cell.elevation];
        // Outer edge (slightly offset)
        const v3 = [p1[0] + offX, p1[1] + offY, cell.elevation];
        const v4 = [p2[0] + offX, p2[1] + offY, cell.elevation];

        // Triangle 1
        positions.push(...v1, ...v2, ...v3);
        colors.push(...cellColor, ...cellColor, ...cellColor);
        // Triangle 2
        positions.push(...v2, ...v4, ...v3);
        colors.push(...cellColor, ...cellColor, ...cellColor);
      }
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('vCellColor', new THREE.Float32BufferAttribute(colors, 3));

    return geometry;
  }

  private calculateFaceNormal(
    v1: [number, number, number],
    v2: [number, number, number],
    v3: [number, number, number],
  ): THREE.Vector3 {
    const a = new THREE.Vector3(...v1);
    const b = new THREE.Vector3(...v2);
    const c = new THREE.Vector3(...v3);
    const cb = new THREE.Vector3().subVectors(c, b);
    const ab = new THREE.Vector3().subVectors(a, b);
    return cb.cross(ab).normalize();
  }

  /**
   * Converts lon/lat/elevation to a 3D Cartesian vertex.
   */
  private getCellVertex(lon: number, lat: number, elevation: number): [number, number, number] {
    const phi = (90 - lat) * (Math.PI / 180);
    // Adjust longitude to match Three.js texture mapping (flipping it horizontally)
    const theta = (lon + 180) * (Math.PI / 180);

    // Radius is 1.0 (base) + elevation-scaled offset
    const r = 1.0 + Math.max(elevation, 0) * this.elevationScale;

    const x = -r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.cos(phi);
    const z = r * Math.sin(phi) * Math.sin(theta);

    return [x, y, z];
  }

  /**
   * Maps biome to RGB color for vertex coloring.
   * Centralized in biomes.ts.
   */
  private getBiomeColor(cell: Cell): [number, number, number] {
    const color = getBiomeTHREEColor(cell.biome, cell.isCoast);
    return [color.r, color.g, color.b];
  }
}
