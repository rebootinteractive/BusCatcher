import * as THREE from 'three';

export interface PickResult {
  data: Record<string, unknown>;
  point: THREE.Vector3;
}

/**
 * Tap detection + raycast picking. Objects opt in by setting
 * `mesh.userData.pick = {...}`; the hit walks up the parent chain to find it.
 */
export class TapInput {
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private downPos: { x: number; y: number } | null = null;
  private downTime = 0;

  constructor(
    private el: HTMLElement,
    private camera: THREE.Camera,
    private getPickRoots: () => THREE.Object3D[],
    private onTap: (result: PickResult | null) => void
  ) {}

  attach() {
    this.el.addEventListener('pointerdown', this.handleDown);
    this.el.addEventListener('pointerup', this.handleUp);
    this.el.addEventListener('pointercancel', this.handleCancel);
  }

  detach() {
    this.el.removeEventListener('pointerdown', this.handleDown);
    this.el.removeEventListener('pointerup', this.handleUp);
    this.el.removeEventListener('pointercancel', this.handleCancel);
  }

  private handleDown = (e: PointerEvent) => {
    this.downPos = { x: e.clientX, y: e.clientY };
    this.downTime = performance.now();
  };

  private handleCancel = () => {
    this.downPos = null;
  };

  private handleUp = (e: PointerEvent) => {
    if (!this.downPos) return;
    const dx = e.clientX - this.downPos.x;
    const dy = e.clientY - this.downPos.y;
    this.downPos = null;
    if (Math.hypot(dx, dy) > 14 || performance.now() - this.downTime > 600) return;

    const rect = this.el.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.getPickRoots(), true);
    for (const hit of hits) {
      let obj: THREE.Object3D | null = hit.object;
      while (obj) {
        if (obj.userData.pick) {
          this.onTap({ data: obj.userData.pick, point: hit.point });
          return;
        }
        obj = obj.parent;
      }
    }
    this.onTap(null);
  };
}
