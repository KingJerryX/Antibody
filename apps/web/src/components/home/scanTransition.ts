"use client";

type Job<T> = () => Promise<T>;
type Runner = <T>(job: Job<T>) => Promise<T>;

const SLOT = "__antibodySpin";

function slot(): { runner: Runner | null } {
  const g = globalThis as unknown as Record<string, { runner: Runner | null } | undefined>;
  return (g[SLOT] ??= { runner: null });
}

/** The layout overlay registers here. Scan actions call `playScanTransition`. */
export function bindScanTransition(fn: Runner) {
  slot().runner = fn;
  return () => {
    if (slot().runner === fn) slot().runner = null;
  };
}

/**
 * Runs `job` under the antibody spin. The promise resolves once the model has grown and `job` has finished.
 * Reduced motion, or a page without the overlay, runs `job` on its own.
 */
export function playScanTransition<T>(job: Job<T>): Promise<T> {
  if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return job();
  const runner = slot().runner;
  if (!runner) return job();
  return runner(job);
}
