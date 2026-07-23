import type { CellValue, LevelData } from '../shared/types';

// Shorthand for readable grids
const _ = null;
const W = 'wall' as const;
const r = 'red' as const;
const b = 'blue' as const;
const g = 'green' as const;

const level1: LevelData = {
  id: 'l1-first-ride',
  name: 'First Ride',
  cols: 3,
  rows: 3,
  deckSize: 3,
  // prettier-ignore
  cells: [
    _, g, _,
    g, _, g,
    _, _, _,
  ] as CellValue[],
  buses: [[g, g, g]],
};

const level2: LevelData = {
  id: 'l2-mixed-seats',
  name: 'Mixed Seats',
  cols: 4,
  rows: 4,
  deckSize: 4,
  // prettier-ignore
  cells: [
    _, r, _, b,
    b, _, r, _,
    _, b, _, r,
    _, _, _, _,
  ] as CellValue[],
  buses: [
    [r, b, r],
    [b, r, b],
  ],
};

const level3: LevelData = {
  id: 'l3-rush-hour',
  name: 'Rush Hour',
  cols: 5,
  rows: 5,
  deckSize: 4,
  // prettier-ignore
  cells: [
    _, r, _, b, _,
    g, W, b, W, g,
    _, r, g, r, _,
    b, _, W, _, b,
    _, g, r, _, _,
  ] as CellValue[],
  buses: [
    [r, r, b],
    [g, b, g],
    [b, r, g],
    [r, b, g],
  ],
};

export const BUILTIN_LEVELS: LevelData[] = [level1, level2, level3];
