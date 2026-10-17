"use client";

import type { ActivityEvent } from "@antibody/core";
import { useEffect, useEffectEvent, useRef } from "react";
import { FLICK, SMOOTH, createSpring, project, velocityOf } from "@/lib/motion";
import { Icon } from "./ui";

const SHOW_MS = 8000;
const RISE = -24; // enters from just above; auto-dismiss leaves the same way

/**
 * "Attack blocked" banner. Drops in from the top, and can be flicked away sideways at any moment,
 * including mid-entrance. Release uses momentum projection, so a quick flick dismisses even
 * when it only moved a little.
 */
export function BlockedBanner({ event, onDone }: { event: ActivityEvent; onDone: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  const done = useEffectEvent(onDone);

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let x = 0;
    let y = RISE;
    let leaving = false;
    const paint = () => {
      const w = node.offsetWidth || 1;
      node.style.transform = reduced ? "" : `translate3d(${x}px, ${y}px, 0)`;
      // Fade as it travels toward the edge so the motion telegraphs the outcome.
      node.style.opacity = String(Math.max(0, 1 - Math.abs(x) / w) * (1 - Math.min(1, Math.abs(y) / Math.abs(RISE))));
    };
    const sx = createSpring((v) => ((x = v), paint()));
    const sy = createSpring((v) => ((y = v), paint()), RISE);

    const leave = () => {
      if (leaving) return;
      leaving = true;
      if (reduced) {
        node.style.opacity = "0";
        setTimeout(() => done(), 200);
      } else sy.to(RISE, { onRest: () => done() });
    };

    // Auto-dismiss, paused while the pointer is on it so it can't vanish mid-read or mid-grab.
    let timer = setTimeout(leave, SHOW_MS);
    const hold = () => clearTimeout(timer);
    const resume = () => {
      clearTimeout(timer);
      if (!leaving) timer = setTimeout(leave, SHOW_MS / 2);
    };

    if (reduced) {
      y = 0;
      paint();
    } else sy.to(0);

    let drag: { id: number; offset: number; startX: number; locked: boolean; samples: { x: number; t: number }[] } | null = null;

    const down = (e: PointerEvent) => {
      if (reduced || e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
      sx.stop(); // grab it wherever it is right now, mid-flight included
      sy.to(0);
      leaving = false;
      hold();
      drag = { id: e.pointerId, offset: e.clientX - sx.value, startX: e.clientX, locked: false, samples: [{ x: e.clientX, t: e.timeStamp }] };
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.locked) {
        if (Math.abs(e.clientX - drag.startX) < 10) return; // hysteresis before committing to a swipe
        drag.locked = true;
        node.setPointerCapture(e.pointerId);
      }
      drag.samples = [...drag.samples.slice(-8), { x: e.clientX, t: e.timeStamp }];
      sx.set(e.clientX - drag.offset); // 1:1, respecting where it was grabbed
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const wasDrag = drag.locked;
      const v = velocityOf(drag.samples);
      drag = null;
      if (!wasDrag) return resume();
      const w = node.offsetWidth;
      const landing = sx.value + project(v);
      if (Math.abs(landing) > w / 2) {
        leaving = true;
        const dir = Math.sign(landing);
        sx.to(dir * (w + 48), { velocity: v, spring: SMOOTH, onRest: () => done() });
      } else {
        sx.to(0, { velocity: v, spring: FLICK }); // thrown back, so a touch of bounce is earned
        resume();
      }
    };

    node.addEventListener("pointerdown", down);
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", up);
    node.addEventListener("pointercancel", up);
    node.addEventListener("pointerenter", hold);
    node.addEventListener("pointerleave", resume);
    node.addEventListener("antibody:dismiss", leave);
    return () => {
      clearTimeout(timer);
      sx.stop();
      sy.stop();
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", up);
      node.removeEventListener("pointerenter", hold);
      node.removeEventListener("pointerleave", resume);
      node.removeEventListener("antibody:dismiss", leave);
    };
  }, []);

  return (
    <div
      ref={el}
      role="alert"
      style={{ opacity: 0, touchAction: "pan-y" }}
      className="banner-fade mt-6 flex cursor-grab select-none items-center gap-5 rounded-2xl border border-red-500/60 bg-red-600/20 p-6 shadow-2xl shadow-red-900/40 backdrop-blur-xl will-change-transform active:cursor-grabbing"
    >
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-red-500 text-white">
        <Icon name="ban" className="h-8 w-8" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold uppercase tracking-widest text-red-200">Attack blocked</p>
        <p className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{event.title}</p>
        {event.detail && <p className="mt-1 truncate text-red-100/80">{event.detail}</p>}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => el.current?.dispatchEvent(new Event("antibody:dismiss"))}
        className="press grid h-9 w-9 shrink-0 place-items-center rounded-full text-red-100/70 hover:bg-white/10 hover:text-white"
      >
        <Icon name="x" className="h-4 w-4" />
      </button>
    </div>
  );
}
