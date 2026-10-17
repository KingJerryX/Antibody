// Pure rules from docs/proposal.md §5.2 (who decides what) and §5.3 (interrupt budget). No I/O here.
import type { ProjectMemory, Severity } from "@antibody/core";

export const CALL_AFTER_MS = 5 * 60_000;

export type Delivery =
  | { route: "text_now"; callAfterMs?: number }
  | { route: "hold_until_quiet_hours_end" }
  | { route: "daily_digest" }
  | { route: "weekly_digest" };

/** "HH:MM" of `now` in an IANA time zone. */
function clock(now: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
}

export function inQuietHours(now: Date, quiet?: ProjectMemory["preferences"]["quietHours"]): boolean {
  if (!quiet) return false;
  const t = clock(now, quiet.tz);
  // Window may wrap midnight (22:00 -> 07:00).
  return quiet.start <= quiet.end ? t >= quiet.start && t < quiet.end : t >= quiet.start || t < quiet.end;
}

/**
 * §5.3: critical+active = text now, call if no reply in 5 min, ignores quiet hours.
 * critical latent = text now but respects quiet hours. medium = daily digest. low = weekly digest.
 * "high" isn't in the proposal table; treated like critical latent (worth a text, not a 2am text).
 */
export function deliveryFor(
  a: { severity: Severity; active?: boolean },
  now: Date,
  quiet?: ProjectMemory["preferences"]["quietHours"],
): Delivery {
  if (a.severity === "critical" && a.active) return { route: "text_now", callAfterMs: CALL_AFTER_MS };
  if (a.severity === "critical" || a.severity === "high") {
    return inQuietHours(now, quiet) ? { route: "hold_until_quiet_hours_end" } : { route: "text_now" };
  }
  return a.severity === "medium" ? { route: "daily_digest" } : { route: "weekly_digest" };
}

// §5.2 approval tiers.
export type ActionKind =
  | "temporary_block" | "rate_limit" | "watch" | "undo" // reversible
  | "approve_fix" // marks a fix approved; it does NOT merge
  | "merge_fix" // permanent
  | "rotate_key" // very sensitive: the human does it
  | "delete_data"; // destructive: never

export type Tier = "reversible" | "github_only" | "human_only" | "never";

const TIERS: Record<ActionKind, Tier> = {
  temporary_block: "reversible",
  rate_limit: "reversible",
  watch: "reversible",
  undo: "reversible",
  // Approving is a recorded intent, reversible by UNDO/reject; the merge itself stays in GitHub.
  approve_fix: "reversible",
  merge_fix: "github_only",
  rotate_key: "human_only",
  delete_data: "never",
};

/** A text reply is weak proof of identity, so it may only trigger reversible actions. */
export function allowedFromText(a: ActionKind): { ok: boolean; why: string } {
  switch (TIERS[a]) {
    case "reversible":
      return { ok: true, why: "reversible action, a text reply is enough" };
    case "github_only":
      return { ok: false, why: "permanent changes are only approved in GitHub" };
    case "human_only":
      return { ok: false, why: "you have to do this one yourself; I'll walk you through it" };
    case "never":
      return { ok: false, why: "Antibody never does destructive actions" };
  }
}

/** Neither a text nor anything else lets Antibody merge or destroy; merges happen in GitHub by a human. */
export const antibodyMayExecute = (a: ActionKind) => TIERS[a] === "reversible";
