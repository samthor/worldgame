import { THREE } from './deps.js';
import { Cell } from './types.js';

export abstract class CellRenderer {
  abstract render(cells: Cell[]): THREE.BufferGeometry;
}

export class TownRenderer extends CellRenderer {
  /**
   * Generates a single BufferGeometry for all houses in the provided cells.
   * Everything is built in "Flat Lon/Lat Space".
   */
  public render(cells: Cell[]): THREE.BufferGeometry {
    const positions: number[] = [];
    const colors: number[] = [];
    const cellIds: number[] = [];

    // Filter for cells that should have towns (e.g., Grassland, Plains)
    const townCells = cells.filter(
      (c) => c.isLand && (c.biome === 'Grassland' || c.biome === 'Plains') && Math.random() < 0.1,
    );

    townCells.forEach((cell) => {
      // Create 1-3 houses per town town cell
      const houseCount = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < houseCount; i++) {
        // Jitter position within the cell (small offsets in lon/lat)
        const lon = cell.centroid[0] + (Math.random() - 0.5) * 0.5;
        const lat = cell.centroid[1] + (Math.random() - 0.5) * 0.5;
        const el = cell.elevation;

        const size = 0.25; // 0.25 degrees wide/tall
        const height = 0.015; // 0.015 radius units tall

        this.addCube(positions, colors, cellIds, cell.id, lon, lat, el, size, height);
      }
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('vCellColor', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('vCellId', new THREE.Float32BufferAttribute(cellIds, 1));
    return geometry;
  }

  private addCube(
    positions: number[],
    colors: number[],
    cellIds: number[],
    cellId: number,
    lon: number,
    lat: number,
    el: number,
    size: number,
    height: number,
  ): void {
    const half = size / 2;
    const baseColor = new THREE.Color(0xaa8866);

    // Cube vertices in [Lon, Lat, El] space
    // Note: This cube will be "warped" by the shader into a perfectly aligned spherical house
    const v = [
      [lon - half, lat - half, el], // 0: Bottom-Front-Left
      [lon + half, lat - half, el], // 1: Bottom-Front-Right
      [lon + half, lat + half, el], // 2: Bottom-Back-Right
      [lon - half, lat + half, el], // 3: Bottom-Back-Left
      [lon - half, lat - half, el + height], // 4: Top-Front-Left
      [lon + half, lat - half, el + height], // 5: Top-Front-Right
      [lon + half, lat + half, el + height], // 6: Top-Back-Right
      [lon - half, lat + half, el + height], // 7: Top-Back-Left
    ];

    // 6 faces, 2 triangles each
    const faces = [
      [0, 2, 1], [0, 3, 2], // Bottom
      [4, 5, 6], [4, 6, 7], // Top
      [0, 1, 5], [0, 5, 4], // Front
      [1, 2, 6], [1, 6, 5], // Right
      [2, 3, 7], [2, 7, 6], // Back
      [3, 0, 4], [3, 4, 7], // Left
    ];

    faces.forEach((face) => {
      face.forEach((idx) => {
        positions.push(...v[idx]);
        colors.push(baseColor.r, baseColor.g, baseColor.b);
        cellIds.push(cellId);
      });
    });
  }
}
