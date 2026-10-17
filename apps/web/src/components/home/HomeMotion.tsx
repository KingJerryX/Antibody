"use client";

import { useEffect } from "react";
import { startMark } from "./mark";
import { startCluster, startFleet, startFlow, type Stage } from "./scrollStages";

const scanRings = new WeakMap<HTMLElement, ScanRing>();
const glows = new WeakMap<HTMLElement, Glow>();
const stages = new WeakMap<HTMLElement, Stage>();

// Modal's inference ring, measured off the live stage: icons slide in on X,
// then each one drifts on its own. A click sends one light around the ring.
const RING = 194;
const STAGE_W = 699;
const STAGE_H = 540;

function smoother(e: number) {
  return e * e * e * (e * (e * 6 - 15) + 10);
}

function clamp01(e: number) {
  return Math.max(0, Math.min(1, e));
}

type ScanRing = Stage;
type Glow = { wave: () => void; stop: () => void };

function paintWave(pieces: HTMLElement[], head: number) {
  const n = pieces.length;
  pieces.forEach((el, i) => {
    const slot = (i / Math.max(1, n - 1)) * 540;
    const along = (head - slot) / 400;
    const lit = head >= 0 && along > 0 && along < 1
      ? along < 0.2 ? smoother(along / 0.2) : 1 - smoother((along - 0.2) / 0.8)
      : 0;
    el.style.setProperty("--wave", String(lit * 1.35));
  });
}

function bindGlow(pieces: HTMLElement[]): Glow {
  if (pieces.length === 0) return { wave() {}, stop() {} };
  let wave = -1;
  let raf = 0;
  let running = false;
  let last = 0;

  const frame = (now: number) => {
    const dt = last ? Math.max(0, Math.min(now - last, 64)) : 0;
    last = now;
    if (wave >= 0) {
      wave += dt * 0.5;
      if (wave > 940) wave = -1;
    }
    const head = wave < 0 ? -1 : clamp01(wave / 940) * 940;
    paintWave(pieces, head);
    if (wave < 0) { running = false; return; }
    raf = requestAnimationFrame(frame);
  };

  return {
    wave() {
      if (running && wave >= 0) return;
      wave = 0;
      running = true;
      last = 0;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
  };
}

function bindScanRing(demo: HTMLElement, reduce: boolean): ScanRing {
  const well = demo.querySelector<HTMLElement>(".well");
  const orbs = [...demo.querySelectorAll<HTMLElement>(".orb")];
  if (!well || orbs.length === 0) return { wave() {}, stop() {}, setActive() {} };

  const n = orbs.length;
  const anchors = orbs.map((_, i) => {
    const a = ((-90 + (360 / n) * i) * Math.PI) / 180;
    return [Math.cos(a) * RING, Math.sin(a) * RING] as const;
  });
  const scale = () => well.clientWidth / STAGE_W;
  const place = (el: HTMLElement, x: number, y: number, opacity: number) => {
    const s = scale();
    el.style.transform = `translate(${x * s}px, ${y * s}px)`;
    el.style.opacity = String(opacity);
  };

  if (reduce) {
    orbs.forEach((el, i) => {
      place(el, anchors[i][0], anchors[i][1], 1);
      el.style.setProperty("--wave", "1");
    });
    return { wave() {}, stop() {}, setActive() {} };
  }

  const state = orbs.map((_, i) => ({
    arrival: { from: 410, elapsed: 0, delay: (i * 135) / 1.4, duration: 1700 / 1.4 } as { from: number; elapsed: number; delay: number; duration: number } | null,
    magnetX: 0,
    magnetY: 0,
  }));
  const hot = new Set<number>();
  const pointer = { active: false, x: 0, y: 0 };
  let fe = 0;
  let le = 1;
  let last = 0;
  let raf = 0;
  let running = false;
  let wave = -1;
  let queued = false;
  let onScreen = false;

  const frame = (now: number) => {
    const dt = last ? Math.max(0, Math.min(now - last, 64)) : 0;
    last = now;
    const rate = hot.size ? 0.8 : 1;
    le += (rate - le) * (1 - Math.exp(-dt / 180));
    fe += dt * le;

    orbs.forEach((el, i) => {
      const [ax, ay] = anchors[i];
      const st = state[i];
      let x = ax;
      let fade = 1;
      let amp = 1;
      if (st.arrival) {
        const ar = st.arrival;
        ar.elapsed += dt * le;
        const r = clamp01((ar.elapsed - ar.delay) / ar.duration);
        const left = 1 - r;
        const bounce = 100 * r ** 3 * left ** 2;
        x = ax + (ar.from - ax) * left ** 4 + Math.sign(ax - ar.from) * bounce;
        fade = clamp01(r * 5);
        amp = smoother(r);
        if (r === 1) st.arrival = null;
      }
      const drift = amp * 3;
      x += Math.sin(fe / (1450 + i * 63) + i * 1.7) * 1.8 * drift;
      let y = ay + Math.sin(fe / (1100 + i * 71) + i * 2.1) * 2.6 * drift;
      const dx = pointer.x - x;
      const dy = pointer.y - y;
      const pull = pointer.active ? smoother(clamp01(1 - Math.hypot(dx, dy) / 140)) * 0.24 * amp : 0;
      const blend = 1 - Math.exp(-dt / 180);
      st.magnetX += (dx * pull - st.magnetX) * blend;
      st.magnetY += (dy * pull - st.magnetY) * blend;
      x += st.magnetX;
      y += st.magnetY;
      place(el, x, y, fade);
    });

    const settled = state.every((s) => !s.arrival);
    if (queued && settled && wave < 0) {
      queued = false;
      wave = 0;
    }
    if (wave >= 0 && settled) {
      wave += dt * 0.5;
      if (wave > 940) wave = -1;
    }
    const head = !settled || wave < 0 ? -1 : clamp01(wave / 940) * 940;
    paintWave(orbs, head);
    orbs.forEach((el, i) => {
      if (!hot.has(i)) return;
      const lit = Number(el.style.getPropertyValue("--wave"));
      if (lit < 1) el.style.setProperty("--wave", "1");
    });

    if (running) raf = requestAnimationFrame(frame);
  };

  const sync = () => {
    const go = onScreen && !document.hidden;
    if (go && !running) {
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    } else if (!go && running) {
      running = false;
      cancelAnimationFrame(raf);
    }
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    const rect = well.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) * STAGE_W) / rect.width - STAGE_W / 2;
    pointer.y = ((e.clientY - rect.top) * STAGE_H) / rect.height - STAGE_H / 2;
    pointer.active = true;
  };
  const onLeave = () => { pointer.active = false; };
  well.addEventListener("pointermove", onMove);
  well.addEventListener("pointerleave", onLeave);
  well.addEventListener("pointercancel", onLeave);

  const orbOff: Array<() => void> = [];
  orbs.forEach((el, i) => {
    const enter = (e: PointerEvent) => { if (e.pointerType !== "touch") hot.add(i); };
    const leave = () => hot.delete(i);
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("pointercancel", leave);
    orbOff.push(() => {
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("pointercancel", leave);
    });
  });

  document.addEventListener("visibilitychange", sync);

  return {
    wave() {
      if (wave >= 0) return;
      if (state.some((s) => s.arrival)) { queued = true; return; }
      wave = 0;
    },
    setActive(on: boolean) {
      onScreen = on;
      sync();
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", sync);
      well.removeEventListener("pointermove", onMove);
      well.removeEventListener("pointerleave", onLeave);
      well.removeEventListener("pointercancel", onLeave);
      orbOff.forEach((fn) => fn());
    },
  };
}

function sendMote(demo: HTMLElement) {
  demo.querySelectorAll("animateMotion").forEach((node) => {
    try { (node as SVGAnimateMotionElement).beginElement(); } catch { /* the glow still lands */ }
  });
}

function arm(demo: HTMLElement, reduce: boolean, stops: Array<() => void>) {
  if (demo.classList.contains("play")) return;
  demo.classList.add("play");
  if (!reduce) sendMote(demo);
  if (demo.classList.contains("tone-scan")) {
    if (!scanRings.has(demo)) {
      const ring = bindScanRing(demo, reduce);
      scanRings.set(demo, ring);
      stops.push(ring.stop);
    }
    return;
  }
  if (demo.classList.contains("fix") || demo.classList.contains("tone-shield") || demo.classList.contains("tone-text")) return;
  if (!glows.has(demo)) {
    const glow = bindGlow(piecesOf(demo));
    glows.set(demo, glow);
    stops.push(glow.stop);
  }
  if (!reduce) glows.get(demo)?.wave();
}

function piecesOf(demo: HTMLElement) {
  if (demo.classList.contains("tone-scan")) return [...demo.querySelectorAll<HTMLElement>(".orb")];
  if (demo.classList.contains("fix")) return [...demo.querySelectorAll<HTMLElement>(".slab")];
  if (demo.classList.contains("tone-shield")) return [...demo.querySelectorAll<HTMLElement>(".ticket"), demo.querySelector<HTMLElement>(".gate")].filter((el): el is HTMLElement => !!el);
  return [demo.querySelector<HTMLElement>(".arc path"), ...demo.querySelectorAll<HTMLElement>(".imsg")].filter((el): el is HTMLElement => !!el);
}

function elevate(demo: HTMLElement, reduce: boolean, stops: Array<() => void>) {
  if (reduce) { demo.classList.add("play"); return; }
  const replay = demo.classList.contains("play");
  arm(demo, reduce, stops);
  demo.classList.remove("lift");
  void demo.offsetWidth;
  demo.classList.add("lift");
  if (replay && !demo.classList.contains("tone-scan")) glows.get(demo)?.wave();
}

export function HomeMotion() {
  useEffect(() => {
    const root = document.querySelector(".ab");
    if (!root) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cleanups: Array<() => void> = [];
    const stops: Array<() => void> = [];

    const canvas = document.getElementById("mark");
    if (canvas instanceof HTMLCanvasElement) cleanups.push(startMark(canvas, reduce));

    const seen = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        const node = en.target as HTMLElement;
        const demo = node.closest<HTMLElement>(".demo") ?? node;
        if (en.isIntersecting) arm(demo, reduce, stops);
        scanRings.get(demo)?.setActive(en.isIntersecting);
        stages.get(demo)?.setActive(en.isIntersecting);
      });
    }, { threshold: 0.42 });
    root.querySelectorAll<HTMLElement>(".demo").forEach((demo) => {
      const canvas = demo.querySelector("canvas.stage");
      if (canvas instanceof HTMLCanvasElement && !stages.has(demo)) {
        const stage = demo.classList.contains("fix")
          ? startFlow(canvas, reduce)
          : demo.classList.contains("tone-shield")
            ? startFleet(canvas, reduce)
            : startCluster(canvas, reduce);
        stages.set(demo, stage);
        stops.push(stage.stop);
        cleanups.push(() => stages.delete(demo));
      }
      const cmd = demo.querySelector(".cmd");
      const onClick = () => {
        elevate(demo, reduce, stops);
        scanRings.get(demo)?.wave();
        stages.get(demo)?.wave();
      };
      cmd?.addEventListener("click", onClick);
      cleanups.push(() => cmd?.removeEventListener("click", onClick));
      if (reduce) arm(demo, reduce, stops);
      // Watch the picture, not the whole row. On a phone the row is taller than
      // the viewport, so the canvas can be on screen while the row is under 42%.
      seen.observe(demo.querySelector(".well") ?? demo);
    });
    cleanups.push(() => seen.disconnect());

    root.querySelectorAll<HTMLElement>(".fig").forEach((fig) => {
      const play = () => {
        if (reduce) return;
        fig.classList.remove("play");
        void fig.offsetWidth;
        fig.classList.add("play");
      };
      fig.addEventListener("pointerenter", play);
      fig.addEventListener("focus", play);
      cleanups.push(() => {
        fig.removeEventListener("pointerenter", play);
        fig.removeEventListener("focus", play);
      });
    });

    const reveal = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) en.target.classList.add("in"); });
    }, { threshold: 0.18 });
    root.querySelectorAll(".reveal").forEach((el) => reveal.observe(el));
    cleanups.push(() => reveal.disconnect());

    return () => {
      stops.forEach((fn) => fn());
      cleanups.forEach((fn) => fn());
    };
  }, []);
  return null;
}
