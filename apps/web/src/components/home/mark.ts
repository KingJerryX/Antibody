type Dot = {
  x: number; y: number; z: number;
  nx: number; ny: number; nz: number;
  kind: "y" | "dot";
  size: number;
  tint: number;
  phase: number;
  scatter: [number, number, number];
  px: number; py: number; vz: number; ps: number;
  lit: number; spec: number; near: number;
};

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 3D particle antibody. Returns a cleanup. */
export function startMark(canvas: HTMLCanvasElement, reduce: boolean): () => void {
  const context = canvas.getContext("2d");
  if (!context) return () => {};
  const ctx: CanvasRenderingContext2D = context;
  const rand = mulberry32(7);
  const dots: Dot[] = [];
  const start = performance.now();
  let raf = 0;
  let last = 0;
  let aimX = 0, aimY = 0, lookX = 0, lookY = 0;
  const radius = 0.132;
  const depth = 0.22;

  function norm(x: number, y: number, z: number) {
    const l = Math.hypot(x, y, z) || 1;
    return [x / l, y / l, z / l];
  }
  function pushDot(x: number, y: number, z: number, nx: number, ny: number, nz: number, face: boolean) {
    const n = norm(nx, ny, nz);
    const roll = rand();
    const grain = rand();
    dots.push({
      x, y, z, nx: n[0], ny: n[1], nz: n[2],
      kind: face && roll < 0.055 ? "y" : "dot",
      size: 0.78 + grain * 0.42,
      tint: 0.78 + rand() * 0.28,
      phase: rand() * Math.PI * 2,
      scatter: [(rand() - 0.5) * 1.7, (rand() - 0.5) * 1.7, (rand() - 0.5) * 0.9],
      px: 0, py: 0, vz: 0, ps: 1, lit: 0, spec: 0, near: 0,
    });
  }
  function closest(x: number, y: number, ax: number, ay: number, bx: number, by: number) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
    return [ax + dx * t, ay + dy * t];
  }
  function addBar(ax: number, ay: number, bx: number, by: number) {
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const px = -uy, py = ux;
    const span = len + radius * 2.05;
    const step = 0.0122;
    const cols = Math.max(10, Math.round(span / step));
    const rows = Math.max(8, Math.round((radius * 2.05) / step));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if (rand() < 0.08) continue;
        const along = ((i + rand() * 0.9) / cols) * span - radius;
        const across = (((j + rand() * 0.9) / rows) - 0.5) * radius * 2.05;
        const x = ax + ux * along + px * across;
        const y = ay + uy * along + py * across;
        const [qx, qy] = closest(x, y, ax, ay, bx, by);
        let ox = x - qx, oy = y - qy;
        const dist = Math.hypot(ox, oy);
        if (dist > radius * 0.985) continue;
        const edge = dist / radius;
        const rim = edge * edge * (3 - 2 * edge);
        const ol = dist || 1;
        ox /= ol; oy /= ol;
        const zf = depth * 0.5 * (1 - rim * 0.62) + (rand() - 0.5) * 0.01;
        pushDot(x, y, zf, ox * rim * 1.15, oy * rim * 1.15, 1 - rim * 0.42, true);
        if (edge > 0.62) {
          const zs = (rand() * 2 - 1) * depth * 0.46;
          const side = 0.35 + rand() * 0.65;
          pushDot(qx + ox * radius * (0.9 + rand() * 0.1), qy + oy * radius * (0.9 + rand() * 0.1), zs, ox, oy, zs / depth * 0.35, false);
          if (side > 0.72) pushDot(x, y, -zf * 0.92, ox * rim, oy * rim, -1, false);
        } else if (rand() < 0.55) {
          pushDot(x, y, -depth * 0.46 + (rand() - 0.5) * 0.012, ox * 0.15, oy * 0.15, -1, false);
        }
      }
    }
  }
  const fork = [0, 0.04];
  const stem = [0, 0.86];
  const left = [-0.58, -0.7];
  const right = [0.6, -0.68];
  addBar(fork[0], fork[1], stem[0], stem[1]);
  addBar(fork[0], fork[1], left[0], left[1]);
  addBar(fork[0], fork[1], right[0], right[1]);

  function layout() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, rect.width * dpr);
    canvas.height = Math.max(1, rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function turn(x: number, y: number, z: number, yaw: number, pitch: number) {
    const cyaw = Math.cos(yaw), syaw = Math.sin(yaw);
    const x1 = x * cyaw + z * syaw;
    const z1 = -x * syaw + z * cyaw;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    return [x1, y * cp - z1 * sp, y * sp + z1 * cp];
  }
  function frame(now: number) {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);
    const t = (now - start) / 1000;
    const dt = Math.min(0.05, Math.max(0, (now - (last || now)) / 1000));
    last = now;
    const gather = reduce ? 1 : Math.min(1, t / 1.15);
    const ease = gather * gather * (3 - 2 * gather);
    const follow = 1 - Math.exp(-dt * 6);
    lookX += (aimX - lookX) * follow;
    lookY += (aimY - lookY) * follow;
    const yaw = reduce ? 0.46 : 0.5 + Math.sin(t * 0.42) * 0.2 + lookX * 0.55;
    const pitch = reduce ? -0.28 : -0.26 + Math.sin(t * 0.27) * 0.045 + lookY;
    const focal = 3.1;
    const s = Math.min(w, h) * 0.5;
    const cx = w * 0.5, cy = h * 0.46;
    for (const d of dots) {
      const wob = reduce ? 0 : Math.sin(t * 1.15 + d.phase) * 0.008;
      const x = d.x * ease + d.scatter[0] * (1 - ease) + wob;
      const y = d.y * ease + d.scatter[1] * (1 - ease);
      const z = d.z * ease + d.scatter[2] * (1 - ease);
      const p3 = turn(x, y, z, yaw, pitch);
      const n3 = turn(d.nx, d.ny, d.nz, yaw, pitch);
      const persp = focal / (focal - p3[2]);
      d.px = cx + p3[0] * s * persp;
      d.py = cy + p3[1] * s * persp;
      d.vz = p3[2];
      d.ps = persp;
      const ndot = n3[0] * -0.22 + n3[1] * -0.46 + n3[2] * 0.86;
      const lit = Math.max(0, ndot);
      d.lit = lit;
      d.spec = Math.pow(lit, 18);
      d.near = Math.max(0, Math.min(1, (p3[2] + 0.62) / 1.15));
    }
    dots.sort((a, b) => a.vz - b.vz);
    let minX = 1e9, maxX = -1e9, maxY = -1e9;
    for (const d of dots) {
      if (d.px < minX) minX = d.px;
      if (d.px > maxX) maxX = d.px;
      if (d.py > maxY) maxY = d.py;
    }
    const shadowW = Math.max(28, (maxX - minX) * 0.32);
    const shadowH = shadowW * 0.2;
    const shadeAmt = 0.2 + 0.8 * ease;
    ctx.save();
    ctx.translate((minX + maxX) / 2 + Math.sin(yaw) * 10, maxY + shadowH * 0.35);
    ctx.scale(1, shadowH / shadowW);
    const sg = ctx.createRadialGradient(0, 0, shadowW * 0.08, 0, 0, shadowW);
    sg.addColorStop(0, `rgba(0, 0, 0, ${0.5 * shadeAmt})`);
    sg.addColorStop(0.55, `rgba(0, 0, 0, ${0.16 * shadeAmt})`);
    sg.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(0, 0, shadowW, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.lineCap = "round";
    for (const d of dots) {
      const shade = Math.pow(d.lit, 0.8);
      const spec = d.spec;
      const tint = d.tint;
      let R: number, G: number, B: number;
      if (shade < 0.28) {
        const u = shade / 0.28;
        R = 18 + u * 20; G = 22 + u * 20; B = 16 + u * 8;
      } else if (shade < 0.62) {
        const u = (shade - 0.28) / 0.34;
        R = 44 + u * 70; G = 50 + u * 130; B = 32 + u * 28;
      } else {
        const u = (shade - 0.62) / 0.38;
        R = 114 + u * 100; G = 180 + u * 64; B = 60 + u * 90;
      }
      R = Math.min(255, R * tint + spec * 120);
      G = Math.min(255, G * tint + spec * 50);
      B = Math.min(255, B * tint + spec * 64);
      const alpha = (0.78 + d.near * 0.22) * (0.3 + 0.7 * ease);
      const rad = d.size * d.ps * (0.9 + d.near * 0.25);
      ctx.fillStyle = `rgb(${R | 0},${G | 0},${B | 0})`;
      ctx.strokeStyle = ctx.fillStyle;
      ctx.globalAlpha = alpha;
      if (d.kind === "y") {
        ctx.lineWidth = Math.max(0.7, rad * 0.7);
        ctx.beginPath();
        ctx.moveTo(d.px, d.py + rad * 1.05); ctx.lineTo(d.px, d.py - rad * 0.15);
        ctx.moveTo(d.px, d.py); ctx.lineTo(d.px - rad * 0.85, d.py - rad * 1.05);
        ctx.moveTo(d.px, d.py); ctx.lineTo(d.px + rad * 0.85, d.py - rad * 1.05);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(d.px, d.py, Math.max(0.4, rad), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    if (!reduce) raf = requestAnimationFrame(frame);
  }

  function onPointer(e: PointerEvent) {
    aimX = (e.clientX / innerWidth - 0.5) * 0.7;
    aimY = (e.clientY / innerHeight - 0.5) * -0.28;
  }
  layout();
  addEventListener("pointermove", onPointer);
  addEventListener("resize", layout);
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    removeEventListener("pointermove", onPointer);
    removeEventListener("resize", layout);
  };
}
