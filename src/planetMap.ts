import { Cell } from './types.js';

export class PlanetMap {
  public readonly cells: Cell[];

  constructor(cells: Cell[]) {
    this.cells = cells;
  }

  /**
   * Retrieves a cell by its unique ID.
   */
  public getCell(id: number): Cell | undefined {
    return this.cells[id];
  }

  /**
   * Returns the neighbors of a given cell.
   */
  public getNeighbors(id: number): Cell[] {
    const cell = this.getCell(id);
    if (!cell) return [];
    return cell.neighbors
      .map(neighborId => this.getCell(neighborId))
      .filter((neighbor): neighbor is Cell => neighbor !== undefined);
  }
}
