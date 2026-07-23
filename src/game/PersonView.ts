import * as THREE from 'three';
import { COLOR_HEX, COLOR_LIGHT, type ColorKey } from '../shared/colors';

/**
 * A little rider: capsule body + lighter head. Materials are per-instance
 * (never shared) because highlight/shake animations mutate them.
 */
export class PersonView {
  readonly group = new THREE.Group();
  private bodyMat: THREE.MeshStandardMaterial;
  private headMat: THREE.MeshStandardMaterial;
  private geoms: THREE.BufferGeometry[] = [];

  constructor(readonly color: ColorKey) {
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: COLOR_HEX[color],
      roughness: 0.55,
      metalness: 0.05,
    });
    this.headMat = new THREE.MeshStandardMaterial({
      color: COLOR_LIGHT[color],
      roughness: 0.5,
      metalness: 0.05,
    });

    const bodyGeo = new THREE.CapsuleGeometry(0.17, 0.24, 4, 12);
    const body = new THREE.Mesh(bodyGeo, this.bodyMat);
    body.position.y = 0.29;
    this.geoms.push(bodyGeo);

    const headGeo = new THREE.SphereGeometry(0.13, 14, 12);
    const head = new THREE.Mesh(headGeo, this.headMat);
    head.position.y = 0.6;
    this.geoms.push(headGeo);

    this.group.add(body, head);
  }

  setEmissive(intensity: number) {
    this.bodyMat.emissive.setHex(COLOR_HEX[this.color]);
    this.bodyMat.emissiveIntensity = intensity;
  }

  dispose() {
    this.group.parent?.remove(this.group);
    for (const g of this.geoms) g.dispose();
    this.bodyMat.dispose();
    this.headMat.dispose();
  }
}
