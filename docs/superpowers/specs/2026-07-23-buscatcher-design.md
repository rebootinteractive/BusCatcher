# BusCatcher — Approved Design (2026-07-23)

A color-sort hybrid puzzle prototype. Maze extraction borrowed from Bus
Jam / Block Jam; the deck buffer, color-seat matching, and single-active-point
bus loop are original layers.

## The board

- **Maze (bottom):** grid of colored people. A person can leave only if
  there's a clear path through empty cells to the **top edge**. Walls and
  other people block. No facing directions.
- **Deck (middle):** buffer row, 5 slots by default (per-level). Overflow =
  lose.
- **Bus loop (top):** buses ride a carousel road. 3 seats per bus, each seat
  a fixed color; a person only fits their own color. Only the bus at the
  **active point** can take people.

## Rules per tap

1. Active bus has a matching empty seat → person boards.
2. No matching seat → person goes to the deck **and the loop rotates one bus
   forward**.
3. Deck already full → **lose**.

Loop behavior:
- Bus fills all 3 seats → drives off and is destroyed; loop advances.
- Successful boarding does **not** rotate the loop.
- A newly arrived bus **auto-pulls** matching deck people (free, no rotation).
- Partial buses keep passengers and carousel back around.
- Buses always close gaps.

**Win:** every bus departs full. No timer.

## Editor (two-step)

1. **Parameters:** grid size, deck size, riders per color. Total must be a
   multiple of 3 (bus count = total ÷ 3).
2. **Deal & tweak:** "Deal" randomly distributes riders to maze cells and
   colors to bus seats. Manual swaps: cell↔cell, seat↔seat (across buses),
   bus↔bus (queue order). Swaps preserve totals. Wall tool shapes the maze.
   Export JSON → `src/levels/contributed/`.

## v1 scope

Menu → level select → play; win/lose modals; 3 built-in levels (first
tutorial-trivial); editor; GitHub Pages deploy.
