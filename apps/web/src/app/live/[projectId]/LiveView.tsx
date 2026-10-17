"use client";

import type { ActivityEvent } from "@antibody/core";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ACTIVITY_META, Card, Icon, Logo, timeAgo } from "@/components/ui";
import { usePoll } from "@/components/usePoll";

type Health = { orchestrator: "up" | "down"; integrations?: Record<string, "live" | "mock" | "disabled"> };

const BANNER_MS = 8000;

export function LiveView({ startCode }: { startCode: string }) {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: events = [], error } = usePoll<ActivityEvent[]>(`/api/activity?projectId=${encodeURIComponent(projectId)}`, 2000);
  const { data: health } = usePoll<Health>("/api/health", 10_000);
  const [banner, setBanner] = useState<ActivityEvent | null>(null);
  const seen = useRef<Set<string> | null>(null);

  // Banner on any block that arrives while the page is open (or one from the last few seconds on load).
  useEffect(() => {
    if (!events.length && !seen.current) return;
    const isFirst = !seen.current;
    const prev = seen.current ?? new Set<string>();
    const fresh = events.filter((e) => e.type === "block" && !prev.has(e.id) && (!isFirst || Date.now() - Date.parse(e.at) < BANNER_MS));
    seen.current = new Set(events.map((e) => e.id));
    if (fresh.length) setBanner(fresh.at(-1)!);
  }, [events]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), BANNER_MS);
    return () => clearTimeout(t);
  }, [banner]);

  const count = (t: ActivityEvent["type"]) => events.filter((e) => e.type === t).length;
  const thread = events.filter((e) => e.type === "message_in" || e.type === "message_out" || e.type === "call");

  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight text-white">
          <span className="relative flex h-3 w-3" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
          </span>
          Live
        </h1>
        <span className="font-mono text-sm text-slate-400">{projectId}</span>
        <Integrations health={health} />
      </div>

      <div aria-live="assertive">
        {banner && (
          <div role="alert" className="animate-rise mt-6 flex items-center gap-5 rounded-2xl border border-red-500/60 bg-red-600/20 p-6 shadow-2xl shadow-red-900/40">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-red-500 text-white">
              <Icon name="ban" className="h-8 w-8" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold uppercase tracking-widest text-red-200">Attack blocked</p>
              <p className="text-2xl font-semibold text-white sm:text-3xl">{banner.title}</p>
              {banner.detail && <p className="mt-1 truncate text-red-100/80">{banner.detail}</p>}
            </div>
          </div>
        )}
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Attacks blocked" value={count("block")} tone="text-red-300" />
        <Stat label="Findings" value={count("finding")} tone="text-orange-300" />
        <Stat label="Fixes ready" value={count("fix_ready")} tone="text-mint" />
        <Stat label="Messages" value={count("message_in") + count("message_out")} tone="text-sky-300" />
      </dl>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="min-w-0 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-slate-400">Activity</h2>
          {error && <p className="mb-3 text-sm text-red-300">Connection problem: {error}. Retrying…</p>}
          {events.length === 0 ? (
            <p className="py-10 text-center text-slate-500">
              Waiting for activity. <Link href="/#scan" className="text-mint hover:underline">Run a scan</Link> to get started.
            </p>
          ) : (
            <ol className="space-y-2">
              {events.slice(-60).reverse().map((e) => (
                <FeedItem key={e.id} event={e} />
              ))}
            </ol>
          )}
        </Card>
        <Phone thread={thread} startCode={startCode} />
      </div>
    </div>
  );
}

function Integrations({ health }: { health?: Health }) {
  if (!health) return null;
  if (health.orchestrator === "down") {
    return <span className="rounded-full bg-amber-400/10 px-3 py-1 text-xs text-amber-200">Orchestrator offline: messages and fixes paused</span>;
  }
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Integrations">
      {Object.entries(health.integrations ?? {}).map(([name, mode]) => (
        <li key={name} className={`rounded-full px-2.5 py-0.5 text-xs ${mode === "live" ? "bg-mint/10 text-mint" : mode === "mock" ? "bg-amber-400/10 text-amber-200" : "bg-white/5 text-slate-400"}`}>
          {name}: {mode}
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <Card className="px-5 py-4">
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`mt-1 text-4xl font-semibold tabular-nums ${tone}`}>{value}</dd>
    </Card>
  );
}

function FeedItem({ event: e }: { event: ActivityEvent }) {
  const meta = ACTIVITY_META[e.type] ?? ACTIVITY_META.scan_started;
  return (
    <li className={`animate-rise flex gap-3 rounded-xl p-3 ${e.type === "block" ? "bg-red-500/10 ring-1 ring-red-500/30" : "hover:bg-white/[0.02]"}`}>
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${meta.tone}`}>
        <Icon name={meta.icon} className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate font-medium text-white">{e.title}</p>
          <time dateTime={e.at} className="shrink-0 text-xs text-slate-500">{timeAgo(e.at)}</time>
        </div>
        <p className="break-words text-sm text-slate-400">
          <span className="text-slate-500">{meta.label}{e.channel ? ` · ${e.channel}` : ""}</span>
          {e.detail && <> · {e.detail}</>}
        </p>
      </div>
    </li>
  );
}

/** The owner's phone: Antibody's texts arrive on the left, the owner's replies go out on the right. */
function Phone({ thread, startCode }: { thread: ActivityEvent[]; startCode: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight; // not scrollIntoView: that would scroll the projector page
  }, [thread.length]);
  return (
    <section aria-label="iMessage thread" className="mx-auto w-full max-w-[380px]">
      <div className="rounded-[2.75rem] border-[10px] border-zinc-800 bg-black shadow-2xl">
        <div className="flex flex-col items-center gap-1 border-b border-white/10 pt-5 pb-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-b from-zinc-500 to-zinc-700 text-white">
            <Logo className="h-6 w-6" />
          </span>
          <span className="text-xs text-zinc-300">Antibody</span>
        </div>
        <div ref={box} className="h-[520px] space-y-2 overflow-y-auto px-3 py-4">
          {thread.length === 0 && <p className="pt-40 text-center text-sm text-zinc-500">No messages yet</p>}
          {thread.map((e) =>
            e.type === "call" ? (
              <p key={e.id} className="py-2 text-center text-xs text-zinc-400">
                <Icon name="phone" className="mr-1 inline h-3 w-3" />
                {e.title}
                {e.detail && <span className="block text-zinc-500">{e.detail}</span>}
              </p>
            ) : (
              <div key={e.id} className={`animate-rise flex ${e.type === "message_in" ? "justify-end" : "justify-start"}`}>
                <p className={`max-w-[78%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] leading-snug ${e.type === "message_in" ? "rounded-br-md bg-[#0a84ff] text-white" : "rounded-bl-md bg-zinc-800 text-zinc-100"}`}>
                  {/* title is the message text; detail is delivery metadata ("[mock iMessage, not sent] to …0100") */}
                  {e.title}
                  {e.detail && <span className="mt-1 block text-[11px] opacity-60">{e.detail}</span>}
                </p>
              </div>
            ),
          )}
        </div>
        <div className="mx-3 mb-4 rounded-full border border-white/10 px-4 py-2 text-sm text-zinc-500">iMessage</div>
      </div>
      <p className="mt-3 text-center text-sm text-slate-400">
        Link your phone: text <span className="font-mono font-semibold text-white">START {startCode}</span> to the Antibody line.
        <span className="block text-xs text-slate-500">Other numbers can&apos;t see or approve anything.</span>
      </p>
    </section>
  );
}
