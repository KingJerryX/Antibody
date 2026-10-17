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

export const SEVERITY_STYLE: Record<Severity, { pill: string; bar: string; text: string }> = {
  critical: { pill: "bg-red-500/15 text-red-300 ring-red-500/40", bar: "bg-red-500", text: "text-red-300" },
  high: { pill: "bg-orange-500/15 text-orange-300 ring-orange-500/40", bar: "bg-orange-500", text: "text-orange-300" },
  medium: { pill: "bg-amber-400/15 text-amber-200 ring-amber-400/40", bar: "bg-amber-400", text: "text-amber-200" },
  low: { pill: "bg-sky-400/15 text-sky-200 ring-sky-400/40", bar: "bg-sky-400", text: "text-sky-200" },
};

export function SeverityPill({ severity }: { severity: Severity }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ring-1 ${SEVERITY_STYLE[severity].pill}`}>
      {severity}
    </span>
  );
}

export const ACTIVITY_META: Record<ActivityType, { label: string; icon: IconName; tone: string }> = {
  scan_started: { label: "Scan started", icon: "search", tone: "text-sky-300 bg-sky-400/10" },
  scan_done: { label: "Scan finished", icon: "check", tone: "text-mint bg-mint/10" },
  finding: { label: "Finding", icon: "alert", tone: "text-orange-300 bg-orange-500/10" },
  fix_drafting: { label: "Drafting fix", icon: "wrench", tone: "text-violet-300 bg-violet-400/10" },
  fix_ready: { label: "Fix ready", icon: "wrench", tone: "text-mint bg-mint/10" },
  message_out: { label: "Antibody texted", icon: "message", tone: "text-sky-300 bg-sky-400/10" },
  message_in: { label: "Owner replied", icon: "reply", tone: "text-blue-300 bg-blue-500/10" },
  call: { label: "Phone call", icon: "phone", tone: "text-emerald-300 bg-emerald-400/10" },
  block: { label: "Attack blocked", icon: "ban", tone: "text-red-300 bg-red-500/15" },
  approval: { label: "Approved", icon: "approve", tone: "text-mint bg-mint/10" },
  undo: { label: "Rolled back", icon: "undo", tone: "text-amber-200 bg-amber-400/10" },
};

export function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`rounded-2xl border border-line bg-panel/80 ${className}`}>{children}</div>;
}

export function timeAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}
