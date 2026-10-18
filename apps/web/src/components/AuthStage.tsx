"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { HomeMotion } from "./home/HomeMotion";
import { FEATURES } from "./home/stages";

const DESIGN = 620;
const DURATION = 1080;
const HOLD = 6200;

type Dir = 1 | -1;

function place(n: number, index: number, leaving: number | null, dir: Dir, moving: boolean) {
  if (n === index) {
    if (leaving !== null && !moving) return dir === 1 ? "at-right" : "at-left";
    return "at-center";
  }
  if (n === leaving) return moving ? (dir === 1 ? "to-left" : "to-right") : "at-center";
  return dir === 1 ? "at-right" : "at-left";
}

export function AuthStage() {
  const frame = useRef<HTMLDivElement>(null);
  const indexRef = useRef(0);
  const lock = useRef(false);
  const [scale, setScale] = useState(0.7);
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [dir, setDir] = useState<Dir>(1);
  const [moving, setMoving] = useState(true);
  const [reduce, setReduce] = useState(false);

  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const apply = () => {
      const width = el.clientWidth;
      if (width > 0) setScale(width / DESIGN);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduce(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const go = useCallback((next: number, direction: Dir) => {
    if (next === indexRef.current) return;
    if (reduce) {
      indexRef.current = next;
      setIndex(next);
      setLeaving(null);
      return;
    }
    if (lock.current) return;
    lock.current = true;
    const previous = indexRef.current;
    indexRef.current = next;
    setDir(direction);
    setLeaving(previous);
    setIndex(next);
    setMoving(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setMoving(true));
    });
    window.setTimeout(() => {
      setLeaving(null);
      lock.current = false;
    }, DURATION + 60);
  }, [reduce]);

  useEffect(() => {
    if (reduce) return;
    const timer = window.setTimeout(() => go((indexRef.current + 1) % FEATURES.length, 1), HOLD);
    return () => window.clearTimeout(timer);
  }, [index, reduce, go]);

  return (
    <aside className="auth-stage" aria-label="How Antibody works">
      <div className="ab auth-motion">
        <HomeMotion />
        <div className="auth-window" ref={frame}>
          {FEATURES.map((item, n) => {
            const Well = item.Well;
            const spot = place(n, index, leaving, dir, moving);
            return (
              <div key={item.title} className={`auth-slide ${spot}`} aria-hidden={n !== index} inert={n !== index}>
                <div className="auth-fit" style={{ transform: `scale(${scale})` }}>
                  <article className={`demo ${item.tone}`}>
                    <div className="slot"><Well /></div>
                  </article>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="auth-captions">
        {FEATURES.map((item, n) => (
          <p key={item.title} className={n === index ? "auth-caption on" : "auth-caption"} aria-hidden={n !== index}>
            <b style={{ color: item.color }}>{item.title}</b>
            <span>{item.line}</span>
          </p>
        ))}
      </div>
      <div className="auth-dots" style={{ "--hold": `${HOLD}ms` } as React.CSSProperties}>
        {FEATURES.map((item, n) => (
          <button
            key={item.title}
            type="button"
            aria-label={item.title}
            aria-current={n === index ? "true" : undefined}
            onClick={() => {
              const forward = (n - index + FEATURES.length) % FEATURES.length;
              const direction: Dir = forward === 0 || forward <= FEATURES.length / 2 ? 1 : -1;
              go(n, forward === 0 ? 1 : direction);
            }}
          />
        ))}
      </div>
    </aside>
  );
}
