export interface Cell {
  id: number;
  centroid: [number, number]; // [lon, lat]
  elevation: number;
  biome: string;
  isLand: boolean;
  isCoast: boolean;
  neighbors: number[];
  coordinates: [number, number][][]; // Polygon geometry rings (after vertex merging)
  originalCoordinates: [number, number][][]; // Original, unmerged polygon geometry rings
  area: number;                       // Spherical area of the cell (solid angle in steradians)
  difficulty: number;                 // Traversal difficulty scale: 1 / area
  riverConnections: number[];         // Indices of adjacent cells connected via river (flows from this cell to neighbor)
}
