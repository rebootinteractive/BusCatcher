import type { ColorKey } from './colors';

/**
 * One maze cell: a colored person, a wall block, or empty walkable floor.
 * Row-major, length cols*rows. Row 0 is the TOP row — the exit side that
 * faces the deck and the bus loop.
 */
export type CellValue = ColorKey | 'wall' | null;

export interface LevelData {
  id: string;
  name: string;
  cols: number;
  rows: number;
  /** Number of buffer slots in the deck. Deck overflow = lose. */
  deckSize: number;
  cells: CellValue[];
  /**
   * The bus queue in loop order. buses[0] starts at the active point.
   * Each bus is exactly 3 seat colors.
   */
  buses: ColorKey[][];
}

export function cellIndex(level: { cols: number }, col: number, row: number): number {
  return row * level.cols + col;
}

export function countRiders(level: LevelData): number {
  return level.cells.filter((c) => c !== null && c !== 'wall').length;
}
