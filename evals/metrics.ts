// Pure scoring for the eval runner, kept separate so it can be unit-tested without the sample app.
import type { FindingKind } from "@antibody/core";

export const isBlocked = (status: number) => status === 403 || status === 429;

/** Nearest-rank percentile. */
export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

/** Seeded kinds found, and findings whose kind wasn't seeded. */
export function scoreScan(seeded: FindingKind[], foundKinds: FindingKind[]) {
  const found = seeded.filter((k) => foundKinds.includes(k)).length;
  const falseAlarms = foundKinds.filter((k) => !seeded.includes(k)).length;
  return { seeded: seeded.length, found, falseAlarms };
}

/** One attack run = the statuses it got back, in order. */
export function scoreShield(attackRuns: number[][], normalStatuses: number[], normalMs: number[]) {
  const firstBlocks = attackRuns.map((s) => s.findIndex(isBlocked)).filter((i) => i >= 0);
  return {
    attacks: attackRuns.length,
    blocked: firstBlocks.length,
    normal: normalStatuses.length,
    wronglyBlocked: normalStatuses.filter(isBlocked).length,
    // Mean number of requests that got through before the first block, over runs that were blocked.
    requestsBeforeBlock: firstBlocks.length ? Math.round(firstBlocks.reduce((a, b) => a + b, 0) / firstBlocks.length) : 0,
    p95Ms: Math.round(percentile(normalMs, 95) * 10) / 10,
  };
}
