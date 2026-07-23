import * as THREE from 'three';
import type { LoopPath } from './LoopPath';
import type { BusView } from './BusView';
import type { PersonView } from './PersonView';

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInQuad = (t: number) => t * t;
export const easeInOutQuad = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

/** A running animation. update returns true when finished. */
export interface Task {
  structural: boolean;
  update(dt: number): boolean;
}

/** Walk a person through world-space waypoints at constant speed. */
export function walkTask(
  person: PersonView,
  waypoints: THREE.Vector3[],
  speed: number,
  onDone: () => void
): Task {
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const d = waypoints[i].distanceTo(waypoints[i - 1]);
    seg.push(d);
    total += d;
  }
  let traveled = 0;
  person.group.position.copy(waypoints[0]);
  return {
    structural: false,
    update(dt) {
      traveled += (speed * dt) / 1000;
      if (traveled >= total || total === 0) {
        person.group.position.copy(waypoints[waypoints.length - 1]);
        onDone();
        return true;
      }
      let acc = 0;
      for (let i = 0; i < seg.length; i++) {
        if (traveled <= acc + seg[i]) {
          const t = (traveled - acc) / seg[i];
          person.group.position.lerpVectors(waypoints[i], waypoints[i + 1], t);
          // Little hop while walking
          person.group.position.y = Math.abs(Math.sin(traveled * Math.PI * 2.2)) * 0.09;
          break;
        }
        acc += seg[i];
      }
      return false;
    },
  };
}

/**
 * Fly a person in a parabolic arc to a moving target. The target is
 * re-sampled every frame so it stays correct while buses shuffle around.
 */
export function flightTask(
  person: PersonView,
  targetFn: (out: THREE.Vector3) => THREE.Vector3,
  duration: number,
  arcHeight: number,
  onDone: () => void
): Task {
  const start = person.group.position.clone();
  const target = new THREE.Vector3();
  let t = 0;
  return {
    structural: false,
    update(dt) {
      t = Math.min(1, t + dt / duration);
      const e = easeInOutQuad(t);
      targetFn(target);
      person.group.position.lerpVectors(start, target, e);
      person.group.position.y += arcHeight * 4 * e * (1 - e);
      if (t >= 1) {
        person.group.position.copy(target);
        onDone();
        return true;
      }
      return false;
    },
  };
}

/** Move a bus forward along the loop from its current s to targetS. */
export function busMoveTask(
  bus: BusView,
  loop: LoopPath,
  targetS: number,
  duration: number,
  onDone?: () => void,
  forceLap = false
): Task {
  const from = bus.s;
  let dist = ((targetS - from) % loop.C + loop.C) % loop.C;
  if (dist < 1e-4) dist = forceLap ? loop.C : 0;
  let t = 0;
  return {
    structural: true,
    update(dt) {
      t = Math.min(1, t + dt / duration);
      bus.setPathPos(loop, from + dist * easeInOutQuad(t));
      if (t >= 1) {
        onDone?.();
        return true;
      }
      return false;
    },
  };
}

/** A full bus drives straight off the play area (+x from the active point). */
export function driveOffTask(bus: BusView, duration: number, onDone: () => void): Task {
  const start = bus.group.position.clone();
  const dir = new THREE.Vector3(1, 0, 0);
  let t = 0;
  return {
    structural: true,
    update(dt) {
      t = Math.min(1, t + dt / duration);
      const e = easeInQuad(t);
      bus.group.position.copy(start).addScaledVector(dir, e * 11);
      if (t >= 1) {
        onDone();
        return true;
      }
      return false;
    },
  };
}

/** Feedback wiggle for a tap on a boxed-in person. */
export function shakeTask(person: PersonView, onDone: () => void): Task {
  const baseX = person.group.position.x;
  const duration = 300;
  let t = 0;
  return {
    structural: false,
    update(dt) {
      t = Math.min(1, t + dt / duration);
      person.group.position.x = baseX + Math.sin(t * Math.PI * 6) * 0.09 * (1 - t);
      if (t >= 1) {
        person.group.position.x = baseX;
        onDone();
        return true;
      }
      return false;
    },
  };
}
