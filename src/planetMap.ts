import { Cell } from './types.js';

export class PlanetMap {
  public readonly cells: Cell[];
  private readonly cellMap = new Map<number, Cell>();

  constructor(cells: Cell[]) {
    this.cells = cells;
    cells.forEach(c => this.cellMap.set(c.id, c));
  }

  /**
   * Retrieves a cell by its unique ID.
   */
  public getCell(id: number): Cell | undefined {
    return this.cellMap.get(id);
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
