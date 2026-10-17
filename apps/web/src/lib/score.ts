import type { Severity } from "@antibody/core";

export const SEVERITY_WEIGHT: Record<Severity, number> = { critical: 35, high: 20, medium: 8, low: 3 };

/** A homepage review that never called the API is not a 100. */
export const LIVE_SKIP_PENALTY = 15;

export function liveChecksSkipped(skipped?: string[]) {
  return skipped?.some((s) => s.startsWith("Live checks did not run")) ?? false;
}

export function securityScore(findings: { severity: Severity }[], skipped?: string[]) {
  const weight = findings.reduce((n, f) => n + SEVERITY_WEIGHT[f.severity], 0);
  const gap = liveChecksSkipped(skipped) ? LIVE_SKIP_PENALTY : 0;
  return Math.max(0, 100 - weight - gap);
}
