import * as THREE from 'three';

/**
 * A stadium-shaped loop road (two straights + two semicircle caps),
 * parameterized by arc length. s = 0 is the ACTIVE POINT: the center of the
 * bottom straight, where the direction of travel is +x. Buses drive in
 * increasing s and wrap at C.
 */
export class LoopPath {
  readonly r: number;
  readonly a: number; // half-length of each straight
  readonly C: number; // circumference
  readonly centerZ: number;
  readonly activeZ: number;

  constructor(busCount: number, readonly spacing: number, activeZ: number) {
    this.r = 1.5;
    this.activeZ = activeZ;
    const needC = Math.max(busCount, 1) * spacing + 1.2;
    this.a = Math.max(1.3, (needC - 2 * Math.PI * this.r) / 4);
    this.C = 4 * this.a + 2 * Math.PI * this.r;
    this.centerZ = activeZ - this.r;
  }

  /** World position on the loop at arc length s (y = 0). */
  point(s: number, out: THREE.Vector3): THREE.Vector3 {
    const { a, r, C, centerZ } = this;
    s = ((s % C) + C) % C;
    const zBottom = centerZ + r;
    const zTop = centerZ - r;
    if (s < a) {
      out.set(s, 0, zBottom);
    } else if (s < a + Math.PI * r) {
      const phi = (s - a) / r;
      out.set(a + r * Math.sin(phi), 0, centerZ + r * Math.cos(phi));
    } else if (s < 3 * a + Math.PI * r) {
      out.set(a - (s - (a + Math.PI * r)), 0, zTop);
    } else if (s < 3 * a + 2 * Math.PI * r) {
      const phi = (s - (3 * a + Math.PI * r)) / r;
      out.set(-a - r * Math.sin(phi), 0, centerZ - r * Math.cos(phi));
    } else {
      out.set(-a + (s - (3 * a + 2 * Math.PI * r)), 0, zBottom);
    }
    return out;
  }

  /** Arc length position for queue slot i (slot 0 = active point). */
  slotS(i: number): number {
    return (((-i * this.spacing) % this.C) + this.C) % this.C;
  }

  /** Loop's total footprint width in world units (road included). */
  width(): number {
    return 2 * this.a + 2 * this.r + 1.2;
  }
}
