import * as THREE from 'three';
import type { LevelData } from '../shared/types';
import { computeLayout, cellX, cellZ, deckX, type Layout } from '../shared/layout';
import { Sim, type SimEvent } from './sim';
import { BoardView } from './BoardView';
import { BusView } from './BusView';
import { PersonView } from './PersonView';
import { TapInput } from './Input';
import { Hud } from './Hud';
import {
  busMoveTask,
  driveOffTask,
  flightTask,
  shakeTask,
  walkTask,
  type Task,
} from './anim';

export interface GameAppOptions {
  level: LevelData;
  onMenu: () => void;
}

/** A queued structural animation (bus movement / departure / deck pull). */
interface StructStep {
  canStart(): boolean;
  start(): Task[];
}

export class GameApp {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private layout: Layout;
  private sim: Sim;
  private board: BoardView;
  private busViews = new Map<number, BusView>();
  private busOrder: number[] = [];
  private mazePeople = new Map<string, PersonView>();
  private deckPeople: (PersonView | null)[];
  private allPeople = new Set<PersonView>();
  private hud: Hud;
  private input: TapInput;
  private tasks: Task[] = [];
  private structQueue: StructStep[] = [];
  private inFlight = new Map<number, number>();
  private shaking = new Set<PersonView>();
  private modalShown = false;
  private resizeObserver: ResizeObserver;
  private rafId = 0;
  private lastTime = 0;

  constructor(private parent: HTMLElement, private opts: GameAppOptions) {
    const level = opts.level;
    this.sim = new Sim(level);
    this.layout = computeLayout({
      cols: level.cols,
      rows: level.rows,
      deckSize: level.deckSize,
      busCount: level.buses.length,
    });
    this.deckPeople = new Array<PersonView | null>(level.deckSize).fill(null);

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
    const fill = new THREE.DirectionalLight(0x88a4ff, 0.18);
    fill.position.set(-3, 4, -2);
    this.scene.add(fill);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);
    this.scene.add(this.camera);

    this.board = new BoardView(this.layout, level.cells);
    this.scene.add(this.board.group);

    // People in the maze
    for (let r = 0; r < level.rows; r++) {
      for (let c = 0; c < level.cols; c++) {
        const v = level.cells[r * level.cols + c];
        if (v === null || v === 'wall') continue;
        const person = new PersonView(v);
        person.group.position.set(cellX(this.layout, c), 0, cellZ(this.layout, r));
        person.group.userData.pick = { type: 'cell', col: c, row: r };
        this.scene.add(person.group);
        this.mazePeople.set(`${c},${r}`, person);
        this.allPeople.add(person);
      }
    }

    // Buses on the loop
    level.buses.forEach((seats, i) => {
      const bus = new BusView(i, seats);
      bus.setPathPos(this.layout.loop, this.layout.loop.slotS(i));
      this.scene.add(bus.group);
      this.busViews.set(i, bus);
      this.busOrder.push(i);
    });

    this.hud = new Hud(parent, level.name, {
      onRestart: () => this.restart(),
      onMenu: () => {
        this.dispose();
        this.opts.onMenu();
      },
    });
    this.hud.setBusCount(this.sim.buses.length);
    this.hud.setDeck(0, level.deckSize);

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

    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  private restart() {
    const { parent, opts } = this;
    this.dispose();
    new GameApp(parent, opts);
  }

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
  }

  private handleTap(data: Record<string, unknown> | null) {
    if (!data || this.sim.status !== 'playing') return;
    if (data.type !== 'cell') return;
    const col = data.col as number;
    const row = data.row as number;

    const events = this.sim.tap(col, row);
    if (events.length === 0) {
      // Boxed in (or an empty/wall cell) — wiggle the person if there is one.
      const person = this.mazePeople.get(`${col},${row}`);
      if (person && !this.shaking.has(person)) {
        this.shaking.add(person);
        this.tasks.push(shakeTask(person, () => this.shaking.delete(person)));
      }
      return;
    }

    this.processEvents(events);
    this.hud.setBusCount(this.sim.buses.length);
    this.hud.setDeck(this.sim.deckCount(), this.sim.deck.length);
  }

  private processEvents(events: SimEvent[]) {
    // events[0] is always the walk; events[1] is that person's destination.
    const walk = events[0];
    if (walk.kind !== 'walk') return;
    const startKey = `${walk.path[0].col},${walk.path[0].row}`;
    const person = this.mazePeople.get(startKey);
    if (!person) return;
    this.mazePeople.delete(startKey);
    delete person.group.userData.pick;

    const waypoints = walk.path.map((cell) =>
      new THREE.Vector3(cellX(this.layout, cell.col), 0, cellZ(this.layout, cell.row))
    );
    // One more step off the top edge before taking flight.
    const last = walk.path[walk.path.length - 1];
    waypoints.push(new THREE.Vector3(cellX(this.layout, last.col), 0, cellZ(this.layout, 0) - 1.1));

    const dest = events[1];
    // Reserve the bus NOW — the person may still be walking when the bus
    // fills up, and its departure must wait for them to actually sit down.
    if (dest.kind === 'board') {
      this.inFlight.set(dest.busId, (this.inFlight.get(dest.busId) ?? 0) + 1);
    }
    this.tasks.push(
      walkTask(person, waypoints, 5.2, () => this.startDestination(person, dest))
    );

    for (let i = 2; i < events.length; i++) {
      const ev = events[i];
      switch (ev.kind) {
        case 'board': {
          // Auto-pull from the deck (from === 'deck' is guaranteed here).
          const slot = ev.deckSlot!;
          const busId = ev.busId;
          const seatIdx = ev.seatIdx;
          this.structQueue.push({
            canStart: () => this.deckPeople[slot] !== null,
            start: () => {
              const p = this.deckPeople[slot]!;
              this.deckPeople[slot] = null;
              const task = flightTask(
                p,
                (out) => this.busViews.get(busId)!.seatWorld(seatIdx, out),
                420,
                1.2,
                () => this.busViews.get(busId)!.seatRider(p, seatIdx)
              );
              task.structural = true;
              return [task];
            },
          });
          break;
        }
        case 'rotate': {
          this.structQueue.push({
            canStart: () => true,
            start: () => this.startRotate(),
          });
          break;
        }
        case 'depart': {
          const busId = ev.busId;
          this.structQueue.push({
            canStart: () => (this.inFlight.get(busId) ?? 0) === 0,
            start: () => this.startDepart(busId),
          });
          break;
        }
        default:
          break; // walk (never here), toDeck/overflow (handled as dest), won/lost (modal check)
      }
    }
  }

  /** The walking person reached the top edge — send them to seat/deck. */
  private startDestination(person: PersonView, dest: SimEvent) {
    if (dest.kind === 'board') {
      const { busId, seatIdx } = dest;
      this.tasks.push(
        flightTask(
          person,
          (out) => this.busViews.get(busId)!.seatWorld(seatIdx, out),
          420,
          1.2,
          () => {
            this.busViews.get(busId)!.seatRider(person, seatIdx);
            this.inFlight.set(busId, (this.inFlight.get(busId) ?? 0) - 1);
          }
        )
      );
    } else if (dest.kind === 'toDeck') {
      const slot = dest.slot;
      const target = new THREE.Vector3(deckX(this.layout, slot), 0, this.layout.deckZ);
      this.tasks.push(
        flightTask(person, (out) => out.copy(target), 380, 1.0, () => {
          this.deckPeople[slot] = person;
        })
      );
    } else if (dest.kind === 'overflow') {
      // Nowhere to stand — dropped in front of the full deck; lose modal follows.
      const target = new THREE.Vector3(0, 0, this.layout.deckZ + 0.9);
      this.tasks.push(flightTask(person, (out) => out.copy(target), 380, 1.0, () => {}));
    }
  }

  /** Loop advances one step: front bus drives the long way around to the back. */
  private startRotate(): Task[] {
    if (this.busOrder.length === 0) return [];
    const front = this.busOrder.shift()!;
    this.busOrder.push(front);
    const tasks: Task[] = [];
    const single = this.busOrder.length === 1;
    this.busOrder.forEach((id, slot) => {
      const bus = this.busViews.get(id)!;
      tasks.push(
        busMoveTask(bus, this.layout.loop, this.layout.loop.slotS(slot), single ? 900 : 480, undefined, single)
      );
    });
    return tasks;
  }

  /** The front bus is full: it drives off; the rest close the gap. */
  private startDepart(busId: number): Task[] {
    const idx = this.busOrder.indexOf(busId);
    if (idx === -1) return [];
    this.busOrder.splice(idx, 1);
    const tasks: Task[] = [];
    const departing = this.busViews.get(busId)!;
    tasks.push(
      driveOffTask(departing, 750, () => {
        this.busViews.delete(busId);
        departing.dispose();
      })
    );
    this.busOrder.forEach((id, slot) => {
      const bus = this.busViews.get(id)!;
      tasks.push(busMoveTask(bus, this.layout.loop, this.layout.loop.slotS(slot), 480));
    });
    return tasks;
  }

  private loop = (now: number) => {
    const dt = Math.min(64, now - this.lastTime);
    this.lastTime = now;
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.rafId = requestAnimationFrame(this.loop);
  };

  private update(dt: number) {
    // Advance all animations; tasks may append new tasks in their onDone.
    for (const task of [...this.tasks]) {
      if (task.update(dt)) {
        const i = this.tasks.indexOf(task);
        if (i >= 0) this.tasks.splice(i, 1);
      }
    }

    // Start the next structural step when no structural animation is running.
    if (
      this.structQueue.length > 0 &&
      !this.tasks.some((t) => t.structural) &&
      this.structQueue[0].canStart()
    ) {
      const step = this.structQueue.shift()!;
      this.tasks.push(...step.start());
    }

    // End state: only after every animation has settled.
    if (
      !this.modalShown &&
      this.sim.status !== 'playing' &&
      this.tasks.length === 0 &&
      this.structQueue.length === 0
    ) {
      this.modalShown = true;
      if (this.sim.status === 'won') this.hud.showWin();
      else this.hud.showLose();
    }
  }

  dispose() {
    cancelAnimationFrame(this.rafId);
    this.input.detach();
    this.resizeObserver.disconnect();
    for (const bus of this.busViews.values()) bus.dispose();
    this.busViews.clear();
    for (const person of this.allPeople) person.dispose();
    this.allPeople.clear();
    this.board.dispose();
    this.hud.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
