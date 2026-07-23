import * as THREE from 'three';
import { COLOR_HEX, type ColorKey } from '../shared/colors';
import type { LoopPath } from './LoopPath';
import type { PersonView } from './PersonView';

const BODY_COLOR = 0xdde3f2;
const CAB_COLOR = 0x9aa7c9;
const WHEEL_COLOR = 0x191c26;

/**
 * An open-top bus: flat platform, front cab, four wheels, and three colored
 * seat pads (front → back). Riders are reparented into the bus group when
 * they sit so departures carry them along. Local +z is forward.
 */
export class BusView {
  readonly group = new THREE.Group();
  /** Current arc-length position on the loop. */
  s = 0;
  private geoms: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];
  private riders: (PersonView | null)[] = [null, null, null];
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();

  constructor(readonly busId: number, readonly seatColors: ColorKey[]) {
    const platformGeo = new THREE.BoxGeometry(0.95, 0.3, 1.95);
    const platformMat = new THREE.MeshStandardMaterial({ color: BODY_COLOR, roughness: 0.6 });
    const platform = new THREE.Mesh(platformGeo, platformMat);
    platform.position.y = 0.32;
    platform.userData.pick = { type: 'bus', busId };
    this.geoms.push(platformGeo);
    this.mats.push(platformMat);
    this.group.add(platform);

    const cabGeo = new THREE.BoxGeometry(0.88, 0.34, 0.3);
    const cabMat = new THREE.MeshStandardMaterial({ color: CAB_COLOR, roughness: 0.4 });
    const cab = new THREE.Mesh(cabGeo, cabMat);
    cab.position.set(0, 0.63, 0.8);
    cab.userData.pick = { type: 'bus', busId };
    this.geoms.push(cabGeo);
    this.mats.push(cabMat);
    this.group.add(cab);

    const wheelGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.12, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: WHEEL_COLOR, roughness: 0.9 });
    this.geoms.push(wheelGeo);
    this.mats.push(wheelMat);
    for (const [x, z] of [
      [-0.5, 0.62],
      [0.5, 0.62],
      [-0.5, -0.62],
      [0.5, -0.62],
    ]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(x, 0.15, z);
      this.group.add(wheel);
    }

    seatColors.forEach((c, i) => {
      const padGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.06, 16);
      const padMat = new THREE.MeshStandardMaterial({
        color: COLOR_HEX[c],
        emissive: COLOR_HEX[c],
        emissiveIntensity: 0.25,
        roughness: 0.4,
      });
      const pad = new THREE.Mesh(padGeo, padMat);
      pad.position.copy(this.seatLocal(i));
      pad.userData.pick = { type: 'seat', busId, seatIdx: i };
      this.geoms.push(padGeo);
      this.mats.push(padMat);
      this.group.add(pad);
    });
  }

  /** Seat position in bus-local space (pad top). Seat 0 is at the front. */
  seatLocal(i: number): THREE.Vector3 {
    return new THREE.Vector3(0, 0.5, 0.42 - i * 0.48);
  }

  seatWorld(i: number, out: THREE.Vector3): THREE.Vector3 {
    out.copy(this.seatLocal(i));
    return this.group.localToWorld(out);
  }

  /** Snap the bus onto the loop at arc length s, oriented along travel. */
  setPathPos(loop: LoopPath, s: number) {
    this.s = ((s % loop.C) + loop.C) % loop.C;
    loop.point(this.s, this.tmp);
    this.group.position.copy(this.tmp);
    loop.point(this.s + 0.12, this.tmp2);
    this.tmp2.y = this.group.position.y;
    this.group.lookAt(this.tmp2);
  }

  /** Reparent a rider into the bus at seat i (they ride along from now on). */
  seatRider(person: PersonView, i: number) {
    this.riders[i] = person;
    this.group.add(person.group);
    person.group.position.copy(this.seatLocal(i));
    person.group.rotation.set(0, 0, 0);
    person.group.scale.setScalar(0.78);
  }

  dispose() {
    this.group.parent?.remove(this.group);
    for (const r of this.riders) r?.dispose();
    for (const g of this.geoms) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}
