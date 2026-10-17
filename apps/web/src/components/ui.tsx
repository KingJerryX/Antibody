// Presentational bits shared by server and client components (no hooks here).
import type { ActivityType, Severity } from "@antibody/core";

const ICONS = {
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  search: "M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4",
  check: "M5 12l5 5 9-10",
  alert: "M12 3l10 18H2zM12 10v4M12 17.5v.5",
  wrench: "M15 4a5 5 0 00-4.6 6.9L4 17.3 6.7 20l6.4-6.4A5 5 0 0020 9l-3 3-3-1-1-3z",
  message: "M4 5h16v11H9l-5 4z",
  reply: "M20 5H4v11h11l5 4zM9 10h6",
  phone: "M5 4h4l2 5-3 2a11 11 0 005 5l2-3 5 2v4a2 2 0 01-2 2A17 17 0 013 6a2 2 0 012-2z",
  ban: "M12 3a9 9 0 100 18 9 9 0 000-18zM5.6 5.6l12.8 12.8",
  undo: "M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3",
  approve: "M12 3a9 9 0 100 18 9 9 0 000-18zM8 12l3 3 5-6",
  x: "M6 6l12 12M18 6L6 18",
  clock: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2",
  arrow: "M5 12h14M13 6l6 6-6 6",
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

/** An antibody: the Y-shaped protein that tags invaders. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className={className} aria-hidden="true">
      <path d="M12 21v-8M12 13L7 6M12 13l5-7M4.5 8.5L8 5M16 5l3.5 3.5" />
    </svg>
  );
}

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];

export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  scan_started: "Scan started",
  scan_done: "Scan finished",
  finding: "Finding",
  fix_drafting: "Drafting fix",
  fix_ready: "Fix ready",
  message_out: "Antibody texted",
  message_in: "Owner replied",
  call: "Phone call",
  block: "Attack blocked",
  approval: "Approved",
  rejection: "Rejected",
  undo: "Rolled back",
};

export function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`material rounded-2xl border border-line bg-panel/80 ${className}`}>{children}</div>;
}

export function timeAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}
