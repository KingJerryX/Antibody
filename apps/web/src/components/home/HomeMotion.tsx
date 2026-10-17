"use client";

import { useEffect } from "react";
import { startMark } from "./mark";

const flareTimers = new WeakMap<HTMLElement, number[]>();

function sendMote(demo: HTMLElement) {
  demo.querySelectorAll("animateMotion").forEach((node) => {
    try { (node as SVGAnimateMotionElement).beginElement(); } catch { /* the glow still lands */ }
  });
}

function arm(demo: HTMLElement, reduce: boolean) {
  if (demo.classList.contains("play")) return;
  demo.classList.add("play");
  if (!reduce) sendMote(demo);
}

function piecesOf(demo: HTMLElement) {
  if (demo.classList.contains("tone-scan")) return [...demo.querySelectorAll<HTMLElement>(".orb")];
  if (demo.classList.contains("fix")) return [...demo.querySelectorAll<HTMLElement>(".slab")];
  if (demo.classList.contains("tone-shield")) return [...demo.querySelectorAll<HTMLElement>(".ticket"), demo.querySelector<HTMLElement>(".gate")].filter((el): el is HTMLElement => !!el);
  return [demo.querySelector<HTMLElement>(".arc path"), ...demo.querySelectorAll<HTMLElement>(".imsg")].filter((el): el is HTMLElement => !!el);
}

function chase(demo: HTMLElement) {
  const prev = flareTimers.get(demo) || [];
  prev.forEach((id) => clearTimeout(id));
  const pieces = piecesOf(demo);
  pieces.forEach((el) => el.classList.remove("flare"));
  void demo.offsetWidth;
  const timers: number[] = [];
  pieces.forEach((el, i) => {
    timers.push(window.setTimeout(() => el.classList.add("flare"), i * 780));
    timers.push(window.setTimeout(() => el.classList.remove("flare"), i * 780 + 560));
  });
  flareTimers.set(demo, timers);
}

function elevate(demo: HTMLElement, reduce: boolean) {
  if (reduce) { demo.classList.add("play"); return; }
  arm(demo, reduce);
  demo.classList.remove("lift");
  void demo.offsetWidth;
  demo.classList.add("lift");
  chase(demo);
}

export function HomeMotion() {
  useEffect(() => {
    const root = document.querySelector(".ab");
    if (!root) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cleanups: Array<() => void> = [];

    const canvas = document.getElementById("mark");
    if (canvas instanceof HTMLCanvasElement) cleanups.push(startMark(canvas, reduce));

    const seen = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        arm(en.target as HTMLElement, reduce);
        seen.unobserve(en.target);
      });
    }, { threshold: 0.46 });
    root.querySelectorAll<HTMLElement>(".demo").forEach((demo) => {
      const cmd = demo.querySelector(".cmd");
      const onClick = () => { seen.unobserve(demo); elevate(demo, reduce); };
      cmd?.addEventListener("click", onClick);
      cleanups.push(() => cmd?.removeEventListener("click", onClick));
      if (reduce) demo.classList.add("play");
      else seen.observe(demo);
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

    return () => cleanups.forEach((fn) => fn());
  }, []);
  return null;
}
