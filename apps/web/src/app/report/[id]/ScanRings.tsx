"use client";

import { AnimatePresence, animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useTransform, type MotionValue } from "motion/react";
import { useEffect, useEffectEvent, useRef, useState } from "react";

/** Shared between the progress view and the report summary, so Motion flies the rings from one to the other. */
export const RINGS_LAYOUT_ID = "scan-rings";
export const RINGS_SPRING = { type: "spring", stiffness: 110, damping: 20, mass: 1 } as const;

export type Ring = { value: number; color: string; idle?: boolean };

function geometry(size: number, count: number) {
  const stroke = size * (count === 1 ? 0.1 : 0.085);
  const gap = stroke * 0.32;
  return Array.from({ length: count }, (_, i) => {
    const r = size / 2 - stroke / 2 - i * (stroke + gap);
    return { r, stroke, length: 2 * Math.PI * r };
  });
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/** One arc that springs from `from` to its value, a little after the ring outside it. */
function SettleArc({ size, r, stroke, length, value, from, delay }: { size: number; r: number; stroke: number; length: number; value: number; from: number; delay: number }) {
  return (
    <motion.circle
      className="ring-fill"
      cx={size / 2}
      cy={size / 2}
      r={r}
      strokeWidth={stroke}
      strokeDasharray={length}
      transform={`rotate(-90 ${size / 2} ${size / 2})`}
      initial={{ strokeDashoffset: length * (1 - from) }}
      animate={{ strokeDashoffset: length * (1 - clamp(value)) }}
      transition={{ type: "spring", stiffness: 55, damping: 15, delay }}
    />
  );
}

/** One arc that follows a live progress value. */
function LiveArc({ size, r, stroke, length, value }: { size: number; r: number; stroke: number; length: number; value: MotionValue<number> }) {
  const offset = useTransform(value, (v) => length * (1 - clamp(v)));
  return <motion.circle className="ring-fill" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} strokeDasharray={length} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ strokeDashoffset: offset }} />;
}

function Track({ size, r, stroke }: { size: number; r: number; stroke: number }) {
  return <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />;
}

/**
 * Concentric activity rings for a finished report, outermost first. `value` is 0..1; idle rings show only their track.
 * `from` is where the fills start: 1 when arriving straight from the progress view, 0 when the report opens directly.
 */
export function Rings({ rings, size, from = 0, children }: { rings: Ring[]; size: number; from?: number; children?: React.ReactNode }) {
  const geo = geometry(size, rings.length);
  return (
    <motion.div className="rings" layoutId={RINGS_LAYOUT_ID} transition={{ layout: RINGS_SPRING }} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        {rings.map((ring, i) => (
          <g key={i} style={{ color: ring.color }}>
            <Track size={size} {...geo[i]} />
            {!ring.idle && <SettleArc size={size} {...geo[i]} value={ring.value} from={from} delay={0.15 + i * 0.12} />}
          </g>
        ))}
      </svg>
      <div className="rings-center">{children}</div>
    </motion.div>
  );
}

/** What the scanner does, for the label under the rings until the real check list is known. */
const PHASES = ["Loading the page and its scripts", "Checking HTTPS and browser headers", "Looking for leaked keys", "Probing the database API", "Testing routes without a login", "Checking DNS and email"];
/** Shortest time the progress plays, so a scan that finished instantly still reads as tests being run. */
const MIN_RUN_MS = 2600;
/** Pause at 100% before the results take over. */
const HOLD_MS = 350;
const SIZE = 300;

/**
 * The scan in progress: one ring filling with a percentage in the middle.
 * While the scan runs, progress eases toward 90% without claiming more; once `done`, it springs to 100% and calls onFinished.
 */
export function ScanProgress({ host, done, color, labels, onFinished }: { host: string; done: boolean; color: string; labels?: string[]; onFinished: () => void }) {
  const reduce = useReducedMotion();
  const progress = useMotionValue(0);
  const percent = useTransform(progress, (v) => Math.round(v * 100));
  const steps = labels?.length ? labels : PHASES;
  const [step, setStep] = useState(0);
  useMotionValueEvent(progress, "change", (v) => setStep(Math.min(steps.length - 1, Math.floor(v * steps.length))));
  const startedAt = useRef(0);
  const finish = useEffectEvent(onFinished);

  useEffect(() => {
    startedAt.current = performance.now();
    // Fast at first, then patient: it approaches 90% and never claims more while the scan is still running.
    const running = animate(progress, 0.9, { duration: reduce ? 0 : 16, ease: [0.12, 0.8, 0.3, 1] });
    return () => running.stop();
  }, [progress, reduce]);

  useEffect(() => {
    if (!done) return;
    let hold: ReturnType<typeof setTimeout>;
    const wait = reduce ? 0 : Math.max(0, MIN_RUN_MS - (performance.now() - startedAt.current));
    const start = setTimeout(() => {
      animate(progress, 1, {
        ...(reduce ? { duration: 0 } : { type: "spring", stiffness: 60, damping: 16, restDelta: 0.0005 }),
        onComplete: () => (hold = setTimeout(finish, reduce ? 0 : HOLD_MS)),
      });
    }, wait);
    return () => {
      clearTimeout(start);
      clearTimeout(hold);
    };
  }, [done, progress, reduce]);

  const [geo] = geometry(SIZE, 1);

  return (
    <div className="scan-run" role="status" aria-live="polite" aria-label={`Scanning ${host}`}>
      <motion.div className="rings" layoutId={RINGS_LAYOUT_ID} transition={{ layout: RINGS_SPRING }} style={{ width: SIZE, height: SIZE }} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} aria-hidden="true">
          <g style={{ color }}>
            <Track size={SIZE} {...geo} />
            <LiveArc size={SIZE} {...geo} value={progress} />
          </g>
        </svg>
        <div className="rings-center">
          <b className="rings-percent">
            <motion.span>{percent}</motion.span>
            <small>%</small>
          </b>
        </div>
      </motion.div>
      <motion.p className="kicker" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        Tests being run
      </motion.p>
      <motion.h1 className="display" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}>
        Scanning {host}
      </motion.h1>
      <div className="scan-run-step">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p key={steps[step]} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
            {steps[step]}…
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
