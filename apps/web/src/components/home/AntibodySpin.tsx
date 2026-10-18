"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { startMark } from "./mark";
import { bindScanTransition } from "./scanTransition";

type Phase = "idle" | "play" | "hold" | "out";

/** Full-screen antibody that spins and grows, covering the jump from a scan action to the report. */
export function AntibodySpin() {
  return (
    <Suspense fallback={null}>
      <SpinOverlay />
    </Suspense>
  );
}

function SpinOverlay() {
  const path = usePathname();
  const [phase, setPhase] = useState<Phase>("idle");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const grownRef = useRef<(() => void) | null>(null);
  const phaseRef = useRef(phase);
  const pathRef = useRef(path);
  phaseRef.current = phase;
  const live = phase === "play" || phase === "hold";

  useEffect(() => {
    return bindScanTransition(async (job) => {
      const grown = new Promise<void>((resolve) => {
        grownRef.current = resolve;
        setTimeout(resolve, 4000);
      });
      setPhase("play");
      try {
        const value = await job();
        await grown;
        setPhase("hold");
        return value;
      } catch (err) {
        grownRef.current = null;
        setPhase("out");
        throw err;
      }
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!live || !canvas) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    return startMark(canvas, reduce, "spin", () => grownRef.current?.());
  }, [live]);

  useEffect(() => {
    if (pathRef.current !== path && phaseRef.current !== "idle") setPhase("out");
    pathRef.current = path;
  }, [path]);

  useEffect(() => {
    if (phase === "idle") return;
    document.documentElement.classList.add("ab-spinning");
    const main = document.getElementById("main");
    if (phase !== "out") main?.setAttribute("inert", "");
    return () => {
      document.documentElement.classList.remove("ab-spinning");
      main?.removeAttribute("inert");
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "out") return;
    const timer = setTimeout(() => setPhase("idle"), 380);
    return () => clearTimeout(timer);
  }, [phase]);

  if (phase === "idle") return null;

  return (
    <div className={phase === "out" ? "ab-spin out" : "ab-spin"} aria-hidden="true">
      <div className="ab-spin-veil" />
      <canvas ref={canvasRef} />
    </div>
  );
}
