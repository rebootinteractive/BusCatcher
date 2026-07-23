import * as THREE from 'three';
import type { CellValue } from '../shared/types';
import { cellX, cellZ, deckX, type Layout } from '../shared/layout';

const TILE_A = 0x2c3245;
const TILE_B = 0x333a52;
const WALL_COLOR = 0x171b28;
const DECK_COLOR = 0x3a4158;
const ROAD_COLOR = 0x252b3c;
const ACCENT = 0x58e1c4;

/**
 * The static stage shared by game and editor: ground, maze floor tiles,
 * wall blocks, exit strip, deck slot tiles, loop road, active-point marker.
 * People and buses live on top of this and are managed by the caller.
 */
export class BoardView {
  readonly group = new THREE.Group();
  /** Flat tile meshes, pickable; userData.pick = { type: 'cell', col, row }. */
  readonly cellTiles: THREE.Mesh[] = [];
  /** Deck tile meshes (not pickable in game). */
  readonly deckTiles: THREE.Mesh[] = [];
  private geoms: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];

  constructor(readonly layout: Layout, cells: CellValue[]) {
    const { cols, rows, deckSize, loop } = layout;

    // Ground plane
    const groundGeo = new THREE.PlaneGeometry(layout.boundsWidth + 6, layout.boundsDepth + 6);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x181b26, roughness: 1 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = -0.03;
    this.geoms.push(groundGeo);
    this.mats.push(groundMat);
    this.group.add(ground);

    // Maze tiles + walls
    const tileGeo = new THREE.BoxGeometry(0.94, 0.08, 0.94);
    const wallGeo = new THREE.BoxGeometry(0.96, 0.55, 0.96);
    const tileMatA = new THREE.MeshStandardMaterial({ color: TILE_A, roughness: 0.85 });
    const tileMatB = new THREE.MeshStandardMaterial({ color: TILE_B, roughness: 0.85 });
    const wallMat = new THREE.MeshStandardMaterial({ color: WALL_COLOR, roughness: 0.9 });
    this.geoms.push(tileGeo, wallGeo);
    this.mats.push(tileMatA, tileMatB, wallMat);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v = cells[r * cols + c];
        const x = cellX(layout, c);
        const z = cellZ(layout, r);
        if (v === 'wall') {
          const wall = new THREE.Mesh(wallGeo, wallMat);
          wall.position.set(x, 0.275, z);
          wall.userData.pick = { type: 'cell', col: c, row: r };
          this.group.add(wall);
          this.cellTiles.push(wall);
        } else {
          const tile = new THREE.Mesh(tileGeo, (c + r) % 2 === 0 ? tileMatA : tileMatB);
          tile.position.set(x, 0.04, z);
          tile.userData.pick = { type: 'cell', col: c, row: r };
          this.group.add(tile);
          this.cellTiles.push(tile);
        }
      }
    }

    // Exit strip along the top edge of the maze
    const exitGeo = new THREE.BoxGeometry(cols * 1.0 + 0.2, 0.05, 0.14);
    const exitMat = new THREE.MeshStandardMaterial({
      color: ACCENT,
      emissive: ACCENT,
      emissiveIntensity: 0.55,
    });
    const exit = new THREE.Mesh(exitGeo, exitMat);
    exit.position.set(0, 0.03, cellZ(layout, 0) - 0.62);
    this.geoms.push(exitGeo);
    this.mats.push(exitMat);
    this.group.add(exit);

    // Deck slot tiles
    const deckGeo = new THREE.BoxGeometry(0.88, 0.08, 0.88);
    const deckMat = new THREE.MeshStandardMaterial({ color: DECK_COLOR, roughness: 0.7 });
    this.geoms.push(deckGeo);
    this.mats.push(deckMat);
    for (let i = 0; i < deckSize; i++) {
      const tile = new THREE.Mesh(deckGeo, deckMat);
      tile.position.set(deckX(layout, i), 0.04, layout.deckZ);
      this.group.add(tile);
      this.deckTiles.push(tile);
    }

    // Loop road ribbon
    const road = this.buildRoad(loop);
    this.group.add(road);

    // Active point marker: glowing pad + ring at s = 0
    const active = new THREE.Vector3();
    loop.point(0, active);
    const padGeo = new THREE.CircleGeometry(0.85, 28);
    padGeo.rotateX(-Math.PI / 2);
    const padMat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.14 });
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.set(active.x, 0.015, active.z);
    this.geoms.push(padGeo);
    this.mats.push(padMat);
    this.group.add(pad);

    const ringGeo = new THREE.RingGeometry(0.72, 0.85, 28);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.7 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(active.x, 0.02, active.z);
    this.geoms.push(ringGeo);
    this.mats.push(ringMat);
    this.group.add(ring);
  }

  private buildRoad(loop: { C: number; point(s: number, out: THREE.Vector3): THREE.Vector3 }): THREE.Mesh {
    const N = 140;
    const halfW = 0.62;
    const positions = new Float32Array(N * 2 * 3);
    const indices: number[] = [];
    const p = new THREE.Vector3();
    const q = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const s = (i / N) * loop.C;
      loop.point(s, p);
      loop.point(s + 0.1, q);
      // Normal in XZ, perpendicular to the tangent
      let nx = -(q.z - p.z);
      let nz = q.x - p.x;
      const len = Math.hypot(nx, nz) || 1;
      nx /= len;
      nz /= len;
      positions.set([p.x + nx * halfW, 0.01, p.z + nz * halfW], i * 6);
      positions.set([p.x - nx * halfW, 0.01, p.z - nz * halfW], i * 6 + 3);
      const a = i * 2;
      const b = i * 2 + 1;
      const c = ((i + 1) % N) * 2;
      const d = ((i + 1) % N) * 2 + 1;
      indices.push(a, b, c, b, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: ROAD_COLOR, roughness: 0.95, side: THREE.DoubleSide });
    this.geoms.push(geo);
    this.mats.push(mat);
    return new THREE.Mesh(geo, mat);
  }

  dispose() {
    this.group.parent?.remove(this.group);
    for (const g of this.geoms) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}
