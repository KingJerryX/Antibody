import { expect, test } from "vitest";
import { FLICK, SMOOTH, project, rubberband, stepSpring, velocityOf } from "./motion.ts";

function settle(params = SMOOTH, v = 0) {
  let s = { x: 0, v };
  let peak = 0;
  for (let i = 0; i < 120; i++) {
    s = stepSpring(s.x, s.v, 100, 1 / 60, params);
    peak = Math.max(peak, s.x);
  }
  return { ...s, peak };
}

test("critically damped spring settles on target without overshoot", () => {
  const r = settle(SMOOTH);
  expect(r.x).toBeCloseTo(100, 1);
  expect(r.peak).toBeLessThanOrEqual(100.01);
});

test("flick spring overshoots a little, then settles", () => {
  const r = settle(FLICK, 2000);
  expect(r.peak).toBeGreaterThan(100);
  expect(r.x).toBeCloseTo(100, 0);
});

test("projection follows Apple's deceleration curve", () => {
  expect(project(1000)).toBeCloseTo(499, 0);
  expect(project(-1000)).toBeCloseTo(-499, 0);
  expect(project(0)).toBe(0);
});

test("rubberband resists more the further you pull", () => {
  expect(rubberband(0, 300)).toBe(0);
  expect(rubberband(100, 300)).toBeLessThan(100);
  expect(rubberband(400, 300) - rubberband(300, 300)).toBeLessThan(rubberband(100, 300));
  expect(rubberband(-100, 300)).toBe(-rubberband(100, 300));
});

test("velocity uses the last ~100ms of samples", () => {
  expect(velocityOf([{ x: 0, t: 0 }, { x: 500, t: 400 }, { x: 550, t: 450 }, { x: 600, t: 500 }])).toBeCloseTo(1000);
  expect(velocityOf([{ x: 0, t: 0 }])).toBe(0);
});
