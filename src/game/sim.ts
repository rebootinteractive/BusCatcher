import type { ColorKey } from '../shared/colors';
import type { CellValue, LevelData } from '../shared/types';

export interface Cell {
  col: number;
  row: number;
}

export interface SeatState {
  color: ColorKey;
  occupied: boolean;
}

export interface BusState {
  id: number;
  seats: SeatState[];
}

/**
 * Everything that happens as a consequence of one tap, in causal order.
 * The view layer replays these as animations; the state is already final
 * by the time the list is returned.
 */
export type SimEvent =
  | { kind: 'walk'; color: ColorKey; path: Cell[] }
  | { kind: 'board'; color: ColorKey; busId: number; seatIdx: number; from: 'maze' | 'deck'; deckSlot?: number }
  | { kind: 'toDeck'; color: ColorKey; slot: number }
  | { kind: 'overflow'; color: ColorKey }
  | { kind: 'depart'; busId: number }
  | { kind: 'rotate' }
  | { kind: 'won' }
  | { kind: 'lost' };

export class Sim {
  readonly cols: number;
  readonly rows: number;
  cells: CellValue[];
  deck: (ColorKey | null)[];
  /** Queue order: buses[0] is at the active point. */
  buses: BusState[];
  status: 'playing' | 'won' | 'lost' = 'playing';

  constructor(level: LevelData) {
    this.cols = level.cols;
    this.rows = level.rows;
    this.cells = level.cells.slice();
    this.deck = new Array<ColorKey | null>(level.deckSize).fill(null);
    this.buses = level.buses.map((seats, i) => ({
      id: i,
      seats: seats.map((c) => ({ color: c, occupied: false })),
    }));
    if (this.buses.length === 0) this.status = 'won';
  }

  cellAt(col: number, row: number): CellValue {
    return this.cells[row * this.cols + col];
  }

  /**
   * BFS through empty cells to the top edge (row 0). Returns the walk path
   * starting at the person's own cell and ending on a row-0 cell, or null
   * if the person is boxed in.
   */
  exitPath(col: number, row: number): Cell[] | null {
    const { cols, rows } = this;
    const start = row * cols + col;
    if (row === 0) return [{ col, row }];

    // prev[i]: -1 unvisited, -2 start, otherwise predecessor index
    const prev = new Int32Array(cols * rows).fill(-1);
    prev[start] = -2;
    const queue: number[] = [start];
    let head = 0;
    let goal = -1;

    while (head < queue.length && goal === -1) {
      const idx = queue[head++];
      const c = idx % cols;
      const r = (idx - c) / cols;
      const neighbors = [
        [c, r - 1],
        [c + 1, r],
        [c, r + 1],
        [c - 1, r],
      ];
      for (const [nc, nr] of neighbors) {
        if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
        const n = nr * cols + nc;
        if (prev[n] !== -1) continue;
        if (this.cells[n] !== null) continue; // walls and people block
        prev[n] = idx;
        if (nr === 0) {
          goal = n;
          break;
        }
        queue.push(n);
      }
    }

    if (goal === -1) return null;
    const path: Cell[] = [];
    let cur = goal;
    while (cur !== start) {
      path.push({ col: cur % cols, row: Math.floor(cur / cols) });
      cur = prev[cur];
    }
    path.push({ col, row });
    path.reverse();
    return path;
  }

  /** True if the person at (col,row) could currently walk out. */
  canExit(col: number, row: number): boolean {
    const v = this.cellAt(col, row);
    if (v === null || v === 'wall') return false;
    return this.exitPath(col, row) !== null;
  }

  /**
   * The player taps the person at (col,row). Mutates state and returns the
   * full causal event list. Empty list = invalid tap (no person / boxed in).
   */
  tap(col: number, row: number): SimEvent[] {
    if (this.status !== 'playing') return [];
    const v = this.cellAt(col, row);
    if (v === null || v === 'wall') return [];
    const path = this.exitPath(col, row);
    if (!path) return [];

    const color = v;
    const ev: SimEvent[] = [{ kind: 'walk', color, path }];
    this.cells[row * this.cols + col] = null;

    const active = this.buses[0];
    const seatIdx = active ? active.seats.findIndex((s) => !s.occupied && s.color === color) : -1;

    if (active && seatIdx >= 0) {
      active.seats[seatIdx].occupied = true;
      ev.push({ kind: 'board', color, busId: active.id, seatIdx, from: 'maze' });
      if (this.isFull(active)) this.departCascade(ev);
    } else {
      const slot = this.deck.indexOf(null);
      if (slot === -1) {
        this.status = 'lost';
        ev.push({ kind: 'overflow', color }, { kind: 'lost' });
        return ev;
      }
      this.deck[slot] = color;
      ev.push({ kind: 'toDeck', color, slot });
      // An unproductive (but legal) move advances the whole loop one step.
      if (this.buses.length > 0) {
        this.buses.push(this.buses.shift()!);
        ev.push({ kind: 'rotate' });
        this.arrivalPull(ev);
      }
    }
    return ev;
  }

  private isFull(bus: BusState): boolean {
    return bus.seats.every((s) => s.occupied);
  }

  /**
   * A bus just arrived at the active point: it pulls every matching person
   * waiting in the deck (free — causes no loop movement).
   */
  private arrivalPull(ev: SimEvent[]): void {
    const active = this.buses[0];
    if (!active) return;
    for (let slot = 0; slot < this.deck.length; slot++) {
      const c = this.deck[slot];
      if (!c) continue;
      const si = active.seats.findIndex((s) => !s.occupied && s.color === c);
      if (si >= 0) {
        active.seats[si].occupied = true;
        this.deck[slot] = null;
        ev.push({ kind: 'board', color: c, busId: active.id, seatIdx: si, from: 'deck', deckSlot: slot });
      }
    }
    if (this.isFull(active)) this.departCascade(ev);
  }

  /** The active bus is full: it leaves the loop; the next bus arrives and pulls. */
  private departCascade(ev: SimEvent[]): void {
    const bus = this.buses.shift()!;
    ev.push({ kind: 'depart', busId: bus.id });
    if (this.buses.length === 0) {
      this.status = 'won';
      ev.push({ kind: 'won' });
      return;
    }
    this.arrivalPull(ev);
  }

  deckCount(): number {
    return this.deck.filter((c) => c !== null).length;
  }
}
