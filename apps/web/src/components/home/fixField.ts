// Three stacked plates. Each top is a hex grid with a gap between tiles.
// A few cells start missing. Clicking fix fills those cells.

const SCALE_FROM = 0.2;
const FLASH = 1.6;
const DUR = 1900;

type Kind = "top" | "x" | "z";
type Cell = {
  x: number;
  y: number;
  depth: number;
  hole: boolean;
  lit: number;
  radial: number;
  jitter: number;
  slab: number;
  kind: Kind;
  glyph: number;
};

// Pointy hex, viewBox half-height 11.8. Scale stays under a full tile so a gap remains.
const GLYPH_D = ["M0 11.8L-10.2 5.9V-5.9L0 -11.8L10.2 -5.9V5.9Z"];
let glyphs: Path2D[] | null = null;
function glyphPaths() {
  glyphs ??= GLYPH_D.map((d) => new Path2D(d));
  return glyphs;
}

type Face = { poly: Array<[number, number]>; depth: number; slab: number; kind: Kind; cy: number };

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function hash(ix: number, iy: number, salt: number) {
  const s = Math.sin(ix * 63.31 + iy * 17.77 + salt) * 9631.23;
  return s - Math.floor(s);
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function introEase(x: number) {
  const x1 = 0.22;
  const y1 = 1;
  const x2 = 0.36;
  const y2 = 1;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slope = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  let t = x;
  for (let i = 0; i < 6; i++) {
    const dx = slope(t);
    if (Math.abs(dx) < 1e-6) break;
    t -= (sampleX(t) - x) / dx;
  }
  return sampleY(clamp01(t));
}

function inside(px: number, py: number, poly: Array<[number, number]>) {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const cross = (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]);
    if (cross === 0) continue;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

function build(w: number, h: number) {
  const cx = w * 0.5;
  const rw = Math.min(w * 0.32, h * 0.3);
  const rh = rw * 0.4;
  const thick = Math.max(11, rh * 0.34);
  const step = rh * 0.86 + thick;
  const stack = 2 * step + rh + thick;
  const top = rh + Math.max(12, (h - stack - 86) * 0.42);
  const plates = [0, 1, 2].map((slab) => {
    const cy = top + (2 - slab) * step;
    const front = 2 - slab;
    const topFace: Array<[number, number]> = [[cx, cy - rh], [cx + rw, cy], [cx, cy + rh], [cx - rw, cy]];
    const left: Array<[number, number]> = [[cx - rw, cy], [cx, cy + rh], [cx, cy + rh + thick], [cx - rw, cy + thick]];
    const right: Array<[number, number]> = [[cx + rw, cy], [cx, cy + rh], [cx, cy + rh + thick], [cx + rw, cy + thick]];
    return [
      { poly: topFace, depth: front + 0.2, slab, kind: "top" as Kind, cy },
      { poly: right, depth: front + 0.7, slab, kind: "x" as Kind, cy },
      { poly: left, depth: front + 0.55, slab, kind: "z" as Kind, cy },
    ];
  }).flat();

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const face of plates) {
    for (const [x, y] of face.poly) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  const pitch = Math.max(6.4, rw / 18);
  const rowPitch = pitch * (Math.sqrt(3) / 2);
  const cells: Cell[] = [];
  for (let row = Math.floor(minY / rowPitch) - 1; row <= Math.ceil(maxY / rowPitch) + 1; row++) {
    const y = row * rowPitch;
    const shift = row & 1 ? pitch / 2 : 0;
    for (let col = Math.floor((minX - shift) / pitch) - 1; col <= Math.ceil((maxX - shift) / pitch) + 1; col++) {
      const x = col * pitch + shift;
      let best: Face | null = null;
      for (const face of plates) {
        if (!inside(x, y, face.poly)) continue;
        if (!best || face.depth > best.depth) best = face;
      }
      if (!best) continue;
      if (best.kind !== "top") continue;
      const midX = best.poly.reduce((s, p) => s + p[0], 0) / best.poly.length;
      const midY = best.poly.reduce((s, p) => s + p[1], 0) / best.poly.length;
      if (!inside(midX + (x - midX) * 1.08, midY + (y - midY) * 1.08, best.poly)) continue;
      const nx = (x - cx) / rw;
      const ny = (y - best.cy) / rh;
      const disk = Math.hypot(nx, ny);
      const across = clamp01(1.02 - Math.abs(nx) * 0.55);
      cells.push({
        x,
        y,
        depth: best.depth,
        hole: hash(col, row, 9.4) < 0.16,
        lit: 0.7 + 0.3 * across,
        radial: clamp01(disk),
        jitter: hash(col, row, 7.31),
        slab: best.slab,
        kind: best.kind,
        glyph: 0,
      });
    }
  }

  cells.sort((a, b) => a.depth - b.depth || a.y - b.y);
  const foot = top + 2 * step + rh + thick;
  return { cells, faces: plates, pitch, glow: [cx, foot, rw] as const };
}

function color(lit: number, alpha: number, flash: number) {
  const t = clamp01(lit);
  let r = 104 + (255 - 104) * t;
  let g = 108 + (148 - 108) * t;
  let b = 98 + (92 - 98) * t;
  const hot = clamp01((t - 0.62) / 0.38);
  r += (255 - r) * hot;
  g += (214 - g) * hot;
  b += (176 - b) * hot;
  if (flash > 1) {
    const f = clamp01((flash - 1) / 2.2);
    r += (255 - r) * f;
    g += (255 - g) * f;
    b += (255 - b) * f;
  }
  return `rgba(${r | 0},${g | 0},${b | 0},${alpha})`;
}

function revealOf(cell: Cell, progress: number) {
  const start = cell.slab * 0.16 + cell.radial * 0.22 + cell.jitter * 0.04;
  return clamp01((progress - start) / 0.16);
}

function facePath(poly: Array<[number, number]>) {
  const path = new Path2D();
  poly.forEach(([x, y], i) => (i === 0 ? path.moveTo(x, y) : path.lineTo(x, y)));
  path.closePath();
  return path;
}

export function startSlabs(canvas: HTMLCanvasElement, reduce: boolean) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { wave() {}, stop() {}, setActive() {} };

  let cssW = 1;
  let cssH = 1;
  let dpr = 1;
  let field = build(1, 1);
  let holes = reduce ? 1 : 0;
  let filling = false;
  let started = 0;
  let sweepAt = -1;
  let raf = 0;
  let running = false;
  let active = false;
  let lost = false;

  const measure = () => {
    if (lost || ctx.isContextLost()) return false;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const next = Math.min(2, window.devicePixelRatio || 1);
    const bw = Math.max(1, Math.round(w * next));
    const bh = Math.max(1, Math.round(h * next));
    // Same guard as the shield stage: rewriting the bitmap on a 1px wobble
    // clears the drawing and retriggers resize until the picture sticks blank.
    if (Math.abs(canvas.width - bw) <= 2 && Math.abs(canvas.height - bh) <= 2 && canvas.width > 1) return false;
    cssW = w;
    cssH = h;
    dpr = next;
    canvas.width = bw;
    canvas.height = bh;
    field = build(cssW, cssH);
    return true;
  };

  const paint = (now: number) => {
    const progress = filling ? introEase(clamp01((now - started) / DUR)) : holes;
    if (filling && now - started >= DUR) {
      filling = false;
      holes = 1;
      sweepAt = now;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    const [gx, gy, unit] = field.glow;

    ctx.save();
    ctx.translate(gx, gy + 8);
    ctx.scale(1, 0.22);
    const shadow = ctx.createRadialGradient(0, 0, unit * 0.15, 0, 0, unit * 1.05);
    shadow.addColorStop(0, "rgba(0,0,0,0.55)");
    shadow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.arc(0, 0, unit * 1.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const glow = ctx.createRadialGradient(gx, gy - unit * 0.8, unit * 0.05, gx, gy - unit * 0.35, unit * 1.3);
    glow.addColorStop(0, "rgba(255,141,92,0.10)");
    glow.addColorStop(1, "rgba(255,141,92,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, cssW, cssH);

    const faces = [...field.faces].sort((a, b) => a.depth - b.depth);
    for (const face of faces) {
      const path = facePath(face.poly);
      ctx.fillStyle = face.kind === "top" ? "#1c1b18" : face.kind === "x" ? "#322920" : "#141311";
      ctx.fill(path);
      ctx.lineWidth = 1;
      ctx.strokeStyle = face.kind === "top" ? "rgba(255,176,128,0.38)" : "rgba(255,255,255,0.05)";
      ctx.stroke(path);
    }

    const glyphScale = (field.pitch * 1.04) / 23.6;
    const breath = reduce ? 1 : 0.92 + 0.08 * Math.sin(now / 1400);
    const sweepT = sweepAt < 0 ? -1 : (now - sweepAt) / 1100;
    for (const face of faces) {
      if (face.kind !== "top") continue;
      ctx.save();
      ctx.clip(facePath(face.poly));
      for (const cell of field.cells) {
        if (cell.slab !== face.slab) continue;
        let pop = 1;
        let alpha = (0.82 + cell.lit * 0.18) * breath;
        let flash = 1;
        if (cell.hole) {
          const reveal = reduce ? 1 : revealOf(cell, progress);
          if (reveal <= 0) continue;
          const eased = reveal * (2 - reveal);
          pop = SCALE_FROM + (1 - SCALE_FROM) * eased;
          flash = 1 + FLASH * reveal * (1 - reveal) * 4;
          alpha *= smoothstep(0, 0.45, reveal);
        }
        if (sweepT >= 0 && sweepT < 1.2) {
          const along = cell.x / cssW;
          const d = (sweepT - along) / 0.16;
          if (d > 0 && d < 1) flash += (d < 0.3 ? d / 0.3 : 1 - (d - 0.3) / 0.7) * 0.9;
        }
        ctx.save();
        ctx.translate(cell.x, cell.y);
        ctx.scale(glyphScale * pop, glyphScale * pop);
        ctx.fillStyle = color(cell.lit, alpha, flash);
        ctx.fill(glyphPaths()[cell.glyph], "evenodd");
        ctx.restore();
      }
      ctx.restore();
    }
  };

  const frame = (now: number) => {
    try {
      if (lost || ctx.isContextLost()) {
        running = false;
        return;
      }
      paint(now);
    } catch {
      running = false;
      return;
    }
    const keep = active || filling;
    if (running && keep && !reduce && !lost) raf = requestAnimationFrame(frame);
    else running = false;
  };

  const kick = () => {
    if (running || reduce || lost || ctx.isContextLost()) return;
    running = true;
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
    try { paint(performance.now()); } catch { return; }
    if (active || filling) kick();
  };
  canvas.addEventListener("contextlost", onLost);
  canvas.addEventListener("contextrestored", onRestored);

  measure();
  try { paint(0); } catch { /* contextrestored paints again */ }

  const resized = new ResizeObserver(() => {
    if (!measure()) return;
    try { paint(performance.now()); } catch { /* the live frame paints the next size */ }
  });
  resized.observe(canvas.parentElement ?? canvas);

  return {
    wave() {
      if (reduce) return;
      holes = 0;
      filling = true;
      sweepAt = -1;
      started = performance.now();
      active = true;
      measure();
      kick();
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      resized.disconnect();
      canvas.removeEventListener("contextlost", onLost);
      canvas.removeEventListener("contextrestored", onRestored);
    },
    setActive(on: boolean) {
      active = on && !reduce;
      if (!active) return;
      measure();
      try { paint(performance.now()); } catch { /* contextrestored paints again */ }
      kick();
    },
  };
}
