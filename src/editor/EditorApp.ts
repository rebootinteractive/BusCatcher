import * as THREE from 'three';
import { COLOR_HEX_STR, COLOR_KEYS, type ColorKey } from '../shared/colors';
import type { CellValue, LevelData } from '../shared/types';
import { computeLayout, cellX, cellZ, type Layout } from '../shared/layout';
import { BoardView } from '../game/BoardView';
import { BusView } from '../game/BusView';
import { PersonView } from '../game/PersonView';
import { TapInput } from '../game/Input';
import { saveCustomLevel } from '../ui/storage';

export interface EditorOptions {
  initial?: LevelData;
  onExit: () => void;
  onTestPlay: (level: LevelData) => void;
}

type Tool = 'swap' | 'wall';

type Selection =
  | { kind: 'cell'; col: number; row: number }
  | { kind: 'seat'; busIdx: number; seatIdx: number }
  | { kind: 'bus'; busIdx: number };

/**
 * Two-step editor:
 *  Step 1 — parameters: grid size, deck size, riders per color (total must be
 *  a multiple of 3). "Deal" randomly distributes riders to the maze and seat
 *  colors to the buses.
 *  Step 2 — manual tweaks: swap any two maze cells, any two seats (across
 *  buses too), or any two buses in the queue. Swaps preserve the color
 *  totals, so a dealt level can't be broken by tweaking.
 */
export class EditorApp {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private layout!: Layout;
  private board: BoardView | null = null;
  private people: PersonView[] = [];
  private busViews: BusView[] = [];
  private marker: THREE.Mesh;
  private markerMat: THREE.MeshBasicMaterial;
  private input: TapInput;
  private resizeObserver: ResizeObserver;
  private rafId = 0;

  private level: LevelData;
  private colorCounts: Record<ColorKey, number>;
  private tool: Tool = 'swap';
  private selection: Selection | null = null;

  private root: HTMLDivElement;
  private statusEl!: HTMLDivElement;
  private nameInput!: HTMLInputElement;
  private countEls = new Map<ColorKey, HTMLSpanElement>();
  private toolBtns = new Map<Tool, HTMLButtonElement>();
  private modalEl: HTMLDivElement | null = null;
  private flashTimer = 0;

  constructor(private parent: HTMLElement, private cb: EditorOptions) {
    this.level = cb.initial
      ? {
          ...cb.initial,
          cells: cb.initial.cells.slice(),
          buses: cb.initial.buses.map((b) => b.slice()),
        }
      : {
          id: `custom-${Date.now()}`,
          name: 'My Level',
          cols: 5,
          rows: 5,
          deckSize: 5,
          cells: new Array<CellValue>(25).fill(null),
          buses: [],
        };

    this.colorCounts = { red: 0, blue: 0, green: 0, yellow: 0, purple: 0 };
    if (cb.initial) {
      for (const c of this.level.cells) {
        if (c !== null && c !== 'wall') this.colorCounts[c]++;
      }
    } else {
      this.colorCounts.red = 3;
      this.colorCounts.blue = 3;
      this.colorCounts.green = 3;
    }

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setClearColor(0x14171f, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    parent.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x14171f);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(3, 9, 5);
    this.scene.add(dir);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);
    this.scene.add(this.camera);

    const markerGeo = new THREE.RingGeometry(0.4, 0.52, 24);
    markerGeo.rotateX(-Math.PI / 2);
    this.markerMat = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.95 });
    this.marker = new THREE.Mesh(markerGeo, this.markerMat);
    this.marker.visible = false;
    this.scene.add(this.marker);

    this.root = document.createElement('div');
    this.root.className = 'overlay';
    parent.appendChild(this.root);
    this.buildUi();

    if (!cb.initial) this.deal(false);
    this.rebuild();

    this.input = new TapInput(
      this.renderer.domElement,
      this.camera,
      () => [this.scene],
      (result) => this.handleTap(result?.data ?? null)
    );
    this.input.attach();

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(parent);
    this.handleResize();

    this.rafId = requestAnimationFrame(this.loop);
  }

  // ---------- UI ----------

  private buildUi() {
    const toolbar = document.createElement('div');
    toolbar.className = 'editor-toolbar';

    const menuBtn = document.createElement('button');
    menuBtn.className = 'tool-btn';
    menuBtn.textContent = '← Menu';
    menuBtn.addEventListener('click', () => {
      this.dispose();
      this.cb.onExit();
    });
    toolbar.appendChild(menuBtn);

    for (const tool of ['swap', 'wall'] as Tool[]) {
      const btn = document.createElement('button');
      btn.className = 'tool-btn';
      btn.textContent = tool === 'swap' ? '⇄ Swap' : '▦ Wall';
      btn.addEventListener('click', () => this.setTool(tool));
      toolbar.appendChild(btn);
      this.toolBtns.set(tool, btn);
    }

    const dealBtn = document.createElement('button');
    dealBtn.className = 'btn small';
    dealBtn.textContent = '🎲 Deal';
    dealBtn.addEventListener('click', () => {
      if (this.deal(true)) this.rebuild();
    });
    toolbar.appendChild(dealBtn);

    for (const [label, key, min, max] of [
      ['Cols', 'cols', 2, 9],
      ['Rows', 'rows', 2, 9],
      ['Deck', 'deckSize', 1, 9],
    ] as const) {
      const field = document.createElement('label');
      field.className = 'editor-field';
      const span = document.createElement('span');
      span.textContent = label;
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.min = String(min);
      inp.max = String(max);
      inp.value = String(this.level[key]);
      inp.addEventListener('change', () => {
        const v = Math.max(min, Math.min(max, Math.round(Number(inp.value) || min)));
        inp.value = String(v);
        if (key === 'deckSize') this.level.deckSize = v;
        else this.resizeGrid(key === 'cols' ? v : this.level.cols, key === 'rows' ? v : this.level.rows);
        this.rebuild();
      });
      field.appendChild(span);
      field.appendChild(inp);
      toolbar.appendChild(field);
    }

    // Per-color rider counts
    const colorBar = document.createElement('div');
    colorBar.className = 'editor-toolbar';
    colorBar.style.paddingTop = '0';
    for (const color of COLOR_KEYS) {
      const row = document.createElement('div');
      row.className = 'span-row';
      const dot = document.createElement('div');
      dot.className = 'color-dot';
      dot.style.background = COLOR_HEX_STR[color];
      dot.style.width = '18px';
      dot.style.height = '18px';
      row.appendChild(dot);

      const minus = document.createElement('button');
      minus.textContent = '−';
      const count = document.createElement('span');
      count.textContent = String(this.colorCounts[color]);
      const plus = document.createElement('button');
      plus.textContent = '+';
      minus.addEventListener('click', () => this.bumpCount(color, -1));
      plus.addEventListener('click', () => this.bumpCount(color, 1));
      row.appendChild(minus);
      row.appendChild(count);
      row.appendChild(plus);
      colorBar.appendChild(row);
      this.countEls.set(color, count);
    }

    this.statusEl = document.createElement('div');
    this.statusEl.className = 'editor-status';

    const bottom = document.createElement('div');
    bottom.className = 'editor-bottom';

    const nameField = document.createElement('label');
    nameField.className = 'editor-field';
    const nameLabel = document.createElement('span');
    nameLabel.textContent = 'Name';
    this.nameInput = document.createElement('input');
    this.nameInput.type = 'text';
    this.nameInput.className = 'wide';
    this.nameInput.value = this.level.name;
    this.nameInput.addEventListener('change', () => {
      this.level.name = this.nameInput.value.trim() || 'My Level';
    });
    nameField.appendChild(nameLabel);
    nameField.appendChild(this.nameInput);
    bottom.appendChild(nameField);

    const mkBtn = (label: string, ghost: boolean, onClick: () => void) => {
      const btn = document.createElement('button');
      btn.className = ghost ? 'btn ghost small' : 'btn small';
      btn.textContent = label;
      btn.addEventListener('click', onClick);
      bottom.appendChild(btn);
      return btn;
    };
    mkBtn('▶ Test', false, () => {
      const lv = this.snapshot();
      this.dispose();
      this.cb.onTestPlay(lv);
    });
    mkBtn('Copy JSON', true, () => this.showJsonModal());
    mkBtn('↓ Download', true, () => this.downloadJson());
    mkBtn('💾 Save', false, () => {
      saveCustomLevel(this.snapshot());
      this.flashStatus('Saved to Your Levels.');
    });

    this.root.appendChild(toolbar);
    this.root.appendChild(colorBar);
    this.root.appendChild(this.statusEl);
    this.root.appendChild(bottom);
    this.setTool('swap');
  }

  private setTool(tool: Tool) {
    this.tool = tool;
    this.selection = null;
    this.marker.visible = false;
    for (const [t, btn] of this.toolBtns) btn.classList.toggle('active', t === tool);
    this.updateStatus();
  }

  private bumpCount(color: ColorKey, delta: number) {
    this.colorCounts[color] = Math.max(0, Math.min(40, this.colorCounts[color] + delta));
    this.countEls.get(color)!.textContent = String(this.colorCounts[color]);
    this.updateStatus();
  }

  private updateStatus(hint?: string) {
    const total = COLOR_KEYS.reduce((sum, c) => sum + this.colorCounts[c], 0);
    let dealState: string;
    if (total === 0) dealState = 'Set rider counts, then Deal';
    else if (total % 3 !== 0) dealState = `⚠ ${total} riders — needs a multiple of 3`;
    else dealState = `${total} riders → ${total / 3} buses`;

    const balanced = this.isBalanced();
    const balanceState = balanced ? '✓ balanced' : '⚠ riders ≠ seats — press Deal';

    const toolHint =
      hint ??
      (this.tool === 'swap'
        ? 'Swap: tap two cells, two seats, or two buses.'
        : 'Wall: tap a cell to toggle a wall.');
    this.statusEl.textContent = `${dealState} · ${balanceState} · ${toolHint}`;
  }

  private flashStatus(msg: string) {
    this.updateStatus(msg);
    window.clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => this.updateStatus(), 3500);
  }

  /** Do the level's rider colors exactly match its bus seat colors? */
  private isBalanced(): boolean {
    const riders: Record<string, number> = {};
    const seats: Record<string, number> = {};
    for (const c of this.level.cells) {
      if (c !== null && c !== 'wall') riders[c] = (riders[c] ?? 0) + 1;
    }
    for (const bus of this.level.buses) {
      for (const s of bus) seats[s] = (seats[s] ?? 0) + 1;
    }
    const keys = new Set([...Object.keys(riders), ...Object.keys(seats)]);
    for (const k of keys) if ((riders[k] ?? 0) !== (seats[k] ?? 0)) return false;
    return true;
  }

  // ---------- Level mutation ----------

  private resizeGrid(cols: number, rows: number) {
    const next = new Array<CellValue>(cols * rows).fill(null);
    for (let r = 0; r < Math.min(rows, this.level.rows); r++) {
      for (let c = 0; c < Math.min(cols, this.level.cols); c++) {
        next[r * cols + c] = this.level.cells[r * this.level.cols + c];
      }
    }
    this.level.cols = cols;
    this.level.rows = rows;
    this.level.cells = next;
  }

  /** Randomly distribute riders into the maze and seat colors onto buses. */
  private deal(verbose: boolean): boolean {
    const total = COLOR_KEYS.reduce((sum, c) => sum + this.colorCounts[c], 0);
    if (total === 0 || total % 3 !== 0) {
      if (verbose) this.flashStatus('Rider total must be a positive multiple of 3.');
      return false;
    }
    const openCells: number[] = [];
    this.level.cells.forEach((v, i) => {
      if (v !== 'wall') openCells.push(i);
    });
    if (total > openCells.length) {
      if (verbose) this.flashStatus(`Not enough open cells (${openCells.length}) for ${total} riders.`);
      return false;
    }

    const pool: ColorKey[] = [];
    for (const c of COLOR_KEYS) for (let i = 0; i < this.colorCounts[c]; i++) pool.push(c);

    // Clear existing riders, keep walls.
    this.level.cells = this.level.cells.map((v) => (v === 'wall' ? 'wall' : null));

    const spots = shuffle(openCells).slice(0, total);
    const mazePool = shuffle(pool.slice());
    spots.forEach((idx, i) => {
      this.level.cells[idx] = mazePool[i];
    });

    const busPool = shuffle(pool.slice());
    const buses: ColorKey[][] = [];
    for (let i = 0; i < busPool.length; i += 3) buses.push(busPool.slice(i, i + 3));
    this.level.buses = shuffle(buses);

    if (verbose) this.flashStatus(`Dealt ${total} riders onto ${buses.length} buses.`);
    return true;
  }

  // ---------- Scene ----------

  private rebuild() {
    this.selection = null;
    this.marker.visible = false;
    this.board?.dispose();
    for (const p of this.people) p.dispose();
    this.people = [];
    for (const b of this.busViews) b.dispose();
    this.busViews = [];

    this.layout = computeLayout({
      cols: this.level.cols,
      rows: this.level.rows,
      deckSize: this.level.deckSize,
      busCount: Math.max(this.level.buses.length, 1),
    });

    this.board = new BoardView(this.layout, this.level.cells);
    this.scene.add(this.board.group);

    for (let r = 0; r < this.level.rows; r++) {
      for (let c = 0; c < this.level.cols; c++) {
        const v = this.level.cells[r * this.level.cols + c];
        if (v === null || v === 'wall') continue;
        const person = new PersonView(v);
        person.group.position.set(cellX(this.layout, c), 0, cellZ(this.layout, r));
        person.group.userData.pick = { type: 'cell', col: c, row: r };
        this.scene.add(person.group);
        this.people.push(person);
      }
    }

    this.level.buses.forEach((seats, i) => {
      const bus = new BusView(i, seats);
      bus.setPathPos(this.layout.loop, this.layout.loop.slotS(i));
      this.scene.add(bus.group);
      this.busViews.push(bus);
    });

    this.fitCamera();
    this.updateStatus();
  }

  // ---------- Interaction ----------

  private handleTap(data: Record<string, unknown> | null) {
    if (!data) return;
    const type = data.type as string;

    if (this.tool === 'wall') {
      if (type !== 'cell') return;
      const idx = (data.row as number) * this.level.cols + (data.col as number);
      const v = this.level.cells[idx];
      if (v === 'wall') this.level.cells[idx] = null;
      else if (v === null) this.level.cells[idx] = 'wall';
      else {
        this.flashStatus('Cell occupied — swap the rider away first.');
        return;
      }
      this.rebuild();
      return;
    }

    // Swap tool
    const sel = this.pickToSelection(data, type);
    if (!sel) return;

    if (!this.selection) {
      this.selection = sel;
      this.showMarker(sel);
      return;
    }
    if (this.sameSelection(this.selection, sel)) {
      this.selection = null;
      this.marker.visible = false;
      return;
    }
    if (this.selection.kind !== sel.kind) {
      this.selection = sel;
      this.showMarker(sel);
      return;
    }

    this.performSwap(this.selection, sel);
    this.rebuild();
  }

  private pickToSelection(data: Record<string, unknown>, type: string): Selection | null {
    if (type === 'cell') return { kind: 'cell', col: data.col as number, row: data.row as number };
    if (type === 'seat') return { kind: 'seat', busIdx: data.busId as number, seatIdx: data.seatIdx as number };
    if (type === 'bus') return { kind: 'bus', busIdx: data.busId as number };
    return null;
  }

  private sameSelection(a: Selection, b: Selection): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  private performSwap(a: Selection, b: Selection) {
    if (a.kind === 'cell' && b.kind === 'cell') {
      const ia = a.row * this.level.cols + a.col;
      const ib = b.row * this.level.cols + b.col;
      [this.level.cells[ia], this.level.cells[ib]] = [this.level.cells[ib], this.level.cells[ia]];
    } else if (a.kind === 'seat' && b.kind === 'seat') {
      const va = this.level.buses[a.busIdx][a.seatIdx];
      this.level.buses[a.busIdx][a.seatIdx] = this.level.buses[b.busIdx][b.seatIdx];
      this.level.buses[b.busIdx][b.seatIdx] = va;
    } else if (a.kind === 'bus' && b.kind === 'bus') {
      const va = this.level.buses[a.busIdx];
      this.level.buses[a.busIdx] = this.level.buses[b.busIdx];
      this.level.buses[b.busIdx] = va;
    }
  }

  private showMarker(sel: Selection) {
    this.marker.visible = true;
    if (sel.kind === 'cell') {
      this.marker.position.set(cellX(this.layout, sel.col), 0.1, cellZ(this.layout, sel.row));
      this.marker.scale.setScalar(1);
    } else if (sel.kind === 'seat') {
      const v = new THREE.Vector3();
      this.busViews[sel.busIdx].seatWorld(sel.seatIdx, v);
      this.marker.position.set(v.x, v.y + 0.06, v.z);
      this.marker.scale.setScalar(0.55);
    } else {
      const bus = this.busViews[sel.busIdx];
      this.marker.position.set(bus.group.position.x, 0.06, bus.group.position.z);
      this.marker.scale.setScalar(2.2);
    }
  }

  // ---------- Export ----------

  private snapshot(): LevelData {
    return {
      ...this.level,
      name: this.nameInput.value.trim() || 'My Level',
      cells: this.level.cells.slice(),
      buses: this.level.buses.map((b) => b.slice()),
    };
  }

  private showJsonModal() {
    this.dismissModal();
    const modal = document.createElement('div');
    modal.className = 'modal';
    const card = document.createElement('div');
    card.className = 'modal-card';
    const h = document.createElement('h2');
    h.textContent = 'Level JSON';
    const ta = document.createElement('textarea');
    ta.className = 'json';
    ta.value = JSON.stringify(this.snapshot(), null, 2);
    ta.readOnly = true;
    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn small';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard?.writeText(ta.value);
      copyBtn.textContent = 'Copied!';
    });
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn ghost small';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => this.dismissModal());
    actions.appendChild(copyBtn);
    actions.appendChild(closeBtn);
    card.appendChild(h);
    card.appendChild(ta);
    card.appendChild(actions);
    modal.appendChild(card);
    this.root.appendChild(modal);
    this.modalEl = modal;
  }

  private dismissModal() {
    this.modalEl?.remove();
    this.modalEl = null;
  }

  private downloadJson() {
    const lv = this.snapshot();
    const json = JSON.stringify(lv, null, 2);
    const slug =
      (lv.name || lv.id || 'level')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'level';
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.flashStatus('Downloaded — drop into src/levels/contributed/ to ship it.');
  }

  // ---------- Frame loop ----------

  private handleResize() {
    const rect = this.parent.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.fitCamera();
    this.camera.updateProjectionMatrix();
  }

  private fitCamera() {
    const margin = 1.2;
    const width = this.layout.boundsWidth + margin;
    const depth = this.layout.boundsDepth + margin;
    const fovV = THREE.MathUtils.degToRad(this.camera.fov);
    const fovH = 2 * Math.atan(Math.tan(fovV / 2) * this.camera.aspect);
    const dV = depth / (2 * Math.tan(fovV / 2));
    const dH = width / (2 * Math.tan(fovH / 2));
    const D = Math.max(dV, dH);
    const tilt = THREE.MathUtils.degToRad(24);
    this.camera.position.set(0, D * Math.cos(tilt), D * Math.sin(tilt));
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
  }

  private loop = (now: number) => {
    this.markerMat.opacity = 0.6 + 0.35 * Math.sin(now / 180);
    this.renderer.render(this.scene, this.camera);
    this.rafId = requestAnimationFrame(this.loop);
  };

  dispose() {
    cancelAnimationFrame(this.rafId);
    window.clearTimeout(this.flashTimer);
    this.input.detach();
    this.resizeObserver.disconnect();
    this.board?.dispose();
    for (const p of this.people) p.dispose();
    for (const b of this.busViews) b.dispose();
    this.marker.geometry.dispose();
    this.markerMat.dispose();
    this.dismissModal();
    this.root.remove();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
