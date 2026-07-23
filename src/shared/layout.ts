import { LoopPath } from '../game/LoopPath';

/**
 * Vertical (z) arrangement, top of screen → bottom:
 *   bus loop | deck row | maze grid
 * Everything is centered on x = 0 and the whole stack is shifted so its
 * z-midpoint sits at the origin (for camera fitting). All fields are final
 * WORLD coordinates — loop.point() also returns world coordinates.
 */
export interface Layout {
  cols: number;
  rows: number;
  deckSize: number;
  loop: LoopPath;
  /** z of maze row 0 centers. Row r sits at mazeTopZ + r. */
  mazeTopZ: number;
  deckZ: number;
  activeZ: number;
  boundsWidth: number;
  boundsDepth: number;
}

const SPACING = 2.15;

export function computeLayout(opts: {
  cols: number;
  rows: number;
  deckSize: number;
  busCount: number;
}): Layout {
  const { cols, rows, deckSize, busCount } = opts;
  // Relative coordinates first (maze row 0 at z = 0).
  const deckZRel = -1.7;
  const activeZRel = deckZRel - 1.9;
  const probe = new LoopPath(busCount, SPACING, activeZRel);

  const extentTop = probe.centerZ - probe.r - 1.2;
  const extentBottom = rows - 1 + 0.7;
  const zOffset = -(extentTop + extentBottom) / 2;

  const loop = new LoopPath(busCount, SPACING, activeZRel + zOffset);

  return {
    cols,
    rows,
    deckSize,
    loop,
    mazeTopZ: zOffset,
    deckZ: deckZRel + zOffset,
    activeZ: activeZRel + zOffset,
    boundsWidth: Math.max(cols + 0.6, deckSize + 0.6, loop.width()),
    boundsDepth: extentBottom - extentTop,
  };
}

export function cellX(layout: Layout, col: number): number {
  return col - (layout.cols - 1) / 2;
}

export function cellZ(layout: Layout, row: number): number {
  return layout.mazeTopZ + row;
}

export function deckX(layout: Layout, slot: number): number {
  return slot - (layout.deckSize - 1) / 2;
}
