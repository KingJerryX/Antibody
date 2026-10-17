// The stages under the how-it-works row. Each one runs only while its section is on screen.
// Fix is the stacked-slab glyph field. Shield lights a field of cells from the middle.
// Text plays an iMessage thread: a call banner, then bubbles that spring in from the tail.

import { startSlabs } from "./fixField";

const W = 699;
const H = 540;

export type Stage = {
  wave: () => void;
  stop: () => void;
  setActive: (on: boolean) => void;
};

type Space = { w: number; h: number; dpr: number; sx: number; sy: number };

function smoother(e: number) {
  return e * e * e * (e * (e * 6 - 15) + 10);
}

function clamp01(e: number) {
  return Math.max(0, Math.min(1, e));
}

function bitmapSize(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, rect.width);
  const h = Math.max(1, rect.height);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  return { w, h, dpr, bw: Math.max(1, Math.round(w * dpr)), bh: Math.max(1, Math.round(h * dpr)) };
}

// Assigning canvas.width clears the bitmap and can fire another resize.
// A one-pixel wobble at some device ratios would wipe the frame forever.
function applyBitmap(canvas: HTMLCanvasElement, bw: number, bh: number) {
  if (Math.abs(canvas.width - bw) <= 2 && Math.abs(canvas.height - bh) <= 2 && canvas.width > 1) return false;
  canvas.width = bw;
  canvas.height = bh;
  return true;
}

function mount(
  canvas: HTMLCanvasElement,
  reduce: boolean,
  draw: (ctx: CanvasRenderingContext2D, dt: number, space: Space) => void,
): Stage {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { wave() {}, stop() {}, setActive() {} };

  let raf = 0;
  let running = false;
  let active = false;
  let lost = false;
  let last = 0;
  let space: Space = { w: 1, h: 1, dpr: 1, sx: 1, sy: 1 };

  const measure = () => {
    if (lost || ctx.isContextLost()) return false;
    const next = bitmapSize(canvas);
    space = { w: next.w, h: next.h, dpr: next.dpr, sx: next.w / W, sy: next.h / H };
    return applyBitmap(canvas, next.bw, next.bh);
  };

  const paint = (dt: number) => {
    if (lost || ctx.isContextLost()) return;
    ctx.setTransform(space.dpr * space.sx, 0, 0, space.dpr * space.sy, 0, 0);
    ctx.clearRect(0, 0, W, H);
    draw(ctx, reduce ? 0 : dt, space);
  };

  const frame = (now: number) => {
    const dt = last ? Math.max(0, Math.min(now - last, 64)) : 16;
    last = now;
    try {
      paint(dt);
    } catch {
      // A lost context throws. Leave running false so the next start can try again.
      running = false;
      return;
    }
    if (running && active && !reduce && !lost) raf = requestAnimationFrame(frame);
    else running = false;
  };

  const kick = () => {
    if (running || reduce || lost || ctx.isContextLost()) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(frame);
  };

  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
    running = false;
    cancelAnimationFrame(raf);
  };
  const onRestored = () => {
    lost = false;
    measure();
    try { paint(0); } catch { return; }
    if (active) kick();
  };
  canvas.addEventListener("contextlost", onLost);
  canvas.addEventListener("contextrestored", onRestored);

  measure();
  try { paint(0); } catch { /* contextrestored paints again */ }

  const resized = new ResizeObserver(() => {
    if (!measure()) return;
    try { paint(0); } catch { /* the live frame paints the next size */ }
  });
  resized.observe(canvas.parentElement ?? canvas);

  return {
    wave() {},
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      resized.disconnect();
      canvas.removeEventListener("contextlost", onLost);
      canvas.removeEventListener("contextrestored", onRestored);
    },
    setActive(on) {
      active = on && !reduce;
      if (!active) return;
      measure();
      try { paint(0); } catch { /* contextrestored paints again */ }
      kick();
    },
  };
}


export function startFlow(canvas: HTMLCanvasElement, reduce: boolean): Stage {
  return startSlabs(canvas, reduce);
}

type Cell = { x: number; y: number; delay: number; light: number; arrived: boolean; from: number; to: number; hold: number; elapsed: number; transition: number; dist: number };

function spreadDelays(cells: { dist: number }[], duration: number) {
  const max = Math.max(...cells.map((c) => c.dist), 1);
  return cells.map((c) => {
    const n = c.dist / max;
    return smoother(n) * duration;
  });
}

function stepCells(cells: Cell[], clock: number, dt: number, fade: number) {
  for (const cell of cells) {
    if (!cell.arrived) {
      const t = clamp01((clock - cell.delay) / fade);
      cell.light = smoother(t);
      if (t === 1) {
        cell.arrived = true;
        cell.from = cell.light;
        cell.to = Math.random() < 0.35 ? 0.15 : 0.45 + Math.random() * 0.55;
        cell.elapsed = 0;
        cell.hold = 400 + Math.random() * 2200;
        cell.transition = fade * (0.85 + Math.random() * 0.7);
      }
    } else {
      cell.elapsed += dt;
      if (cell.elapsed > cell.hold) {
        const t = clamp01((cell.elapsed - cell.hold) / cell.transition);
        cell.light = cell.from + (cell.to - cell.from) * smoother(t);
        if (t === 1) {
          cell.from = cell.light;
          cell.to = cell.light < 0.2 ? 0.5 + Math.random() * 0.5 : Math.random() < 0.4 ? 0.05 : 0.35 + Math.random() * 0.6;
          cell.elapsed = 0;
          cell.hold = 300 + Math.random() * 1800;
        }
      }
    }
  }
}

function pulse(wave: number, dist: number) {
  if (wave < 0) return 0;
  const e = (wave - dist) / 650;
  if (e <= 0 || e >= 1) return 0;
  return e < 0.2 ? smoother(e / 0.2) : 1 - smoother((e - 0.2) / 0.8);
}

export function startFleet(canvas: HTMLCanvasElement, reduce: boolean): Stage {
  const cells: Cell[] = [];
  for (let i = 0; i < 374; i++) {
    const col = i % 22;
    const row = Math.floor(i / 22);
    const x = 24.5 + col * 30;
    const y = 20 + row * 30;
    const dist = Math.hypot((col - 10.5) * 30, (row - 8) * 30);
    cells.push({ x, y, delay: 0, light: 0, arrived: false, from: 0, to: 0, hold: 0, elapsed: 0, transition: 700, dist });
  }
  const delays = spreadDelays(cells, 1500);
  cells.forEach((cell, i) => { cell.delay = delays[i]; });
  let clock = 0;
  let wave = -1;

  const stage = mount(canvas, reduce, (ctx, dt) => {
    if (!reduce) {
      clock += dt;
      if (wave >= 0) {
        wave += dt;
        if (wave > 1700) wave = -1;
      }
      stepCells(cells, clock, dt, 620);
    }
    for (const cell of cells) {
      const lit = reduce ? 0.55 : cell.light;
      const hot = reduce ? 0 : pulse(wave, cell.dist);
      ctx.beginPath();
      ctx.roundRect(cell.x + 0.5, cell.y + 0.5, 19, 19, 3.5);
      ctx.fillStyle = "rgba(255,255,255,0.03)";
      ctx.fill();
      if (lit > 0.02) {
        ctx.fillStyle = `rgba(162,112,235,${lit * 0.34})`;
        ctx.fill();
      }
      if (hot > 0) {
        ctx.fillStyle = `rgba(205,177,255,${hot * 0.24})`;
        ctx.fill();
      }
      const edge = lit;
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(${Math.round(252 + (181 - 252) * edge)},${Math.round(255 + (137 - 255) * edge)},${Math.round(250 + (250 - 250) * edge)},${0.05 + 0.67 * edge})`;
      ctx.stroke();
    }
  });

  return {
    ...stage,
    wave() {
      if (wave < 0) wave = 0;
      stage.setActive(true);
    },
  };
}

// Plays the iMessage thread in the Text well, then loops the next alert.
// Bubbles stay collapsed until `.told`. Reduced motion shows the first thread finished.
const THREADS = [
  { note: "Live call", sent: "Blocked a dump.", follow: "Fix is ready. Reply YES.", reply: "YES" },
  { note: "Incoming call", sent: "A secret shipped in the bundle.", follow: "I can strip it out.", reply: "Do it" },
  { note: "Calling now", sent: "The database is wide open.", follow: "Lock the rows?", reply: "Lock it" },
];
const THREAD_MS = 5400;

export function startCluster(canvas: HTMLCanvasElement, reduce: boolean): Stage {
  const demo = canvas.closest<HTMLElement>(".demo");
  const thread = demo?.querySelector(".thread");
  if (!demo || !thread) return { wave() {}, stop() {}, setActive() {} };

  const sent = thread.querySelector<HTMLElement>(".row.out.a p");
  const follow = thread.querySelector<HTMLElement>(".row.out.b p");
  const reply = thread.querySelector<HTMLElement>(".row.in p");
  const note = thread.querySelector<HTMLElement>(".call small");
  let index = 0;
  let timer = 0;
  let on = false;
  let looping = false;

  const apply = (n: number) => {
    const script = THREADS[n % THREADS.length];
    if (sent) sent.textContent = script.sent;
    if (follow) follow.textContent = script.follow;
    if (reply) reply.textContent = script.reply;
    if (note) note.textContent = script.note;
  };

  const play = () => {
    window.clearTimeout(timer);
    if (reduce) {
      apply(0);
      demo.classList.add("told");
      return;
    }
    apply(index);
    demo.classList.remove("told");
    void demo.offsetWidth;
    demo.classList.add("told");
    looping = true;
    timer = window.setTimeout(() => {
      if (!on) { looping = false; return; }
      index = (index + 1) % THREADS.length;
      play();
    }, THREAD_MS);
  };

  return {
    wave() {
      index = (index + 1) % THREADS.length;
      play();
    },
    stop() {
      window.clearTimeout(timer);
      looping = false;
    },
    setActive(active) {
      on = active;
      if (!active) {
        window.clearTimeout(timer);
        looping = false;
        return;
      }
      if (!looping) play();
    },
  };
}
