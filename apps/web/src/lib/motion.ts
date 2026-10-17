// Spring physics for gesture-driven UI, using Apple's damping-ratio + response parameters
// (see .claude/skills/apple-design). No dependency: a few lines of rAF beat a motion library here.

export type SpringParams = { damping: number; response: number };

/** Critically damped: the default for anything that wasn't thrown. */
export const SMOOTH: SpringParams = { damping: 1, response: 0.4 };
/** A little overshoot, only after a gesture that carried momentum. */
export const FLICK: SpringParams = { damping: 0.8, response: 0.3 };

/** Advance a unit-mass spring toward `target` by `dt` seconds. Pure, so it can be tested. */
export function stepSpring(x: number, v: number, target: number, dt: number, { damping, response }: SpringParams) {
  const k = (2 * Math.PI / response) ** 2;
  const c = (4 * Math.PI * damping) / response;
  const h = 1 / 240; // fixed substeps keep it stable on slow frames
  for (let t = 0; t < dt; t += h) {
    const s = Math.min(h, dt - t);
    v += (-k * (x - target) - c * v) * s;
    x += v * s;
  }
  return { x, v };
}

/** Where a flick would come to rest (Apple's scroll-deceleration projection). `v` in px/s. */
export function project(v: number, decelerationRate = 0.998) {
  return ((v / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Progressive resistance past a boundary: the further you pull, the less it follows. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/** Release velocity in px/s from recent pointer samples (last ~100ms), not just the final move. */
export function velocityOf(samples: { x: number; t: number }[]) {
  const last = samples.at(-1);
  const first = samples.find((s) => last && last.t - s.t <= 100);
  if (!last || !first || last.t === first.t) return 0;
  return ((last.x - first.x) / (last.t - first.t)) * 1000;
}

/**
 * Animate a value with a spring on rAF. Retargeting mid-flight keeps the current position and
 * velocity, so the motion can always be interrupted and reversed without a jump.
 */
export function createSpring(onFrame: (x: number) => void, x = 0) {
  let v = 0;
  let target = x;
  let params = SMOOTH;
  let raf = 0;
  let last = 0;
  let done: (() => void) | undefined;

  const tick = (now: number) => {
    const dt = Math.min(0.064, (now - last) / 1000);
    last = now;
    ({ x, v } = stepSpring(x, v, target, dt, params));
    if (Math.abs(x - target) < 0.1 && Math.abs(v) < 1) {
      x = target;
      v = 0;
      raf = 0;
      onFrame(x);
      done?.();
      return;
    }
    onFrame(x);
    raf = requestAnimationFrame(tick);
  };

  return {
    get value() {
      return x;
    },
    /** Jump without animating (e.g. 1:1 tracking during a drag). Stops any running spring. */
    set(next: number) {
      cancelAnimationFrame(raf);
      raf = 0;
      x = next;
      v = 0;
      onFrame(x);
    },
    to(next: number, opts: { velocity?: number; spring?: SpringParams; onRest?: () => void } = {}) {
      target = next;
      params = opts.spring ?? SMOOTH;
      if (opts.velocity !== undefined) v = opts.velocity;
      done = opts.onRest;
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}
