import type { ActivityEvent, ActivityType } from "@antibody/core";

type Mode = "live" | "mock" | "disabled";

const FIX_EVENTS: ActivityType[] = ["fix_drafting", "fix_ready", "approval", "rejection"];

/** Fixes still waiting on the owner: their latest event is "fix_ready", not a decision or a revision. */
export function fixesAwaitingReview(events: ActivityEvent[]): number {
  const latest = new Map<string, ActivityType>();
  for (const e of events) if (e.refId && FIX_EVENTS.includes(e.type)) latest.set(e.refId, e.type);
  return [...latest.values()].filter((t) => t === "fix_ready").length;
}

/** The scan the page should describe: the newest finished one. */
export const latestScanId = (events: ActivityEvent[]) => events.findLast((e) => e.type === "scan_done")?.refId;

const NAMES: Record<string, string> = { photon: "iMessage", chalk: "Chalk", factory: "Droid", github: "GitHub", voice: "calls" };

/** "Droid live · iMessage, Chalk and calls mocked · GitHub off": one line instead of a chip per service. */
export function integrationSummary(integrations: Record<string, Mode>): string {
  const by = (mode: Mode) => Object.entries(integrations).filter(([, m]) => m === mode).map(([name]) => NAMES[name] ?? name);
  const list = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);
  return [
    by("live").length ? `${list(by("live"))} live` : "",
    by("mock").length ? `${list(by("mock"))} mocked` : "",
    by("disabled").length ? `${list(by("disabled"))} off` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
