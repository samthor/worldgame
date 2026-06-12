export interface Cell {
  id: number;
  centroid: [number, number]; // [lon, lat]
  elevation: number;
  biome: string;
  isLand: boolean;
  isCoast: boolean;
  neighbors: number[];
  coordinates: [number, number][][]; // Polygon geometry rings (after vertex merging)
  area: number;                       // Spherical area of the cell (solid angle in steradians)
  difficulty: number;                 // Traversal difficulty scale: 1 / area
}
