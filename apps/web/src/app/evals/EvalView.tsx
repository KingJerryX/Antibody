"use client";

import type { ActivityEvent, EvalSnapshot } from "@antibody/core";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePoll } from "@/components/usePoll";

type Board = EvalSnapshot | { empty: true };

const isSnapshot = (b: Board): b is EvalSnapshot => "shield" in b;

/** The deployed sample the eval hits. Blocks from that shield land on this project. */
const NOTE_NEST = "proj_notenest-henna-vercel-app";

const BEATS = [
  { route: "GET /api/users/7", why: "One session reading other people's profiles" },
  { route: "POST /api/chat", why: "A flood of model calls from one session" },
  { route: "GET /supabase/rest/v1/users", why: "A scrape of the users table" },
] as const;

export function EvalView() {
  const { data, error, setData } = usePoll<Board>("/api/evals", 5000);
  const [running, setRunning] = useState(false);
  const [since, setSince] = useState(0);
  const [runError, setRunError] = useState<string | null>(null);

  async function run() {
    setSince(Date.now());
    setRunning(true);
    setRunError(null);
    const res = await fetch("/api/evals", { method: "POST" });
    const body = (await res.json().catch(() => null)) as (Board & { error?: string }) | null;
    if (!res.ok || !body || !isSnapshot(body)) setRunError(body?.error ?? "Eval failed");
    else setData(body);
    setRunning(false);
  }

  return (
    <div className="ab">
      <div className="wrap page view">
        <div className="report-top">
          <nav className="crumb" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden="true">/</span>
            <span>Eval</span>
          </nav>
        </div>
        <h1 className="display">Shield eval</h1>
        <p className="live-lede">
          Planted attacks should be blocked. Ordinary sessions, each making several requests, should not. A run counts as Chalk only when the blocked responses say so. This run scores the deployed NoteNest, not a local port.
        </p>
        <p>
          <button className="btn btn-sm" type="button" disabled={running} onClick={() => void run()}>
            {running ? "Scoring NoteNest…" : "Run eval"}
          </button>
        </p>
        {running && <AttackPlay since={since} />}
        {runError && <p className="alert">{runError}</p>}
        {error && <p className="alert">Couldn&apos;t load the scoreboard: {error}</p>}
        {!data && !error && <p className="sub">Loading…</p>}
        {data && !isSnapshot(data) && (
          <p className="sub">
            No published run yet. Run the eval to score the deployed NoteNest.
          </p>
        )}
        {data && isSnapshot(data) && <Board snap={data} />}
      </div>
    </div>
  );
}

/** Ordinary traffic passes the gate. The attack in flight stops in front of it, using a real block when one arrives. */
function AttackPlay({ since }: { since: number }) {
  const { data: events = [] } = usePoll<ActivityEvent[]>(`/api/activity?projectId=${encodeURIComponent(NOTE_NEST)}`, 2000);
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setBeat((n) => n + 1), 2400);
    return () => clearInterval(id);
  }, []);
  const live = events.filter((e) => e.type === "block" && Date.parse(e.at) >= since - 1500);
  const latest = live.at(-1);
  const scripted = BEATS[beat % BEATS.length];
  const route = latest ? latest.title.replace(/^(Blocked|Challenged)\s+/, "") : scripted.route;
  const why = latest?.detail || scripted.why;
  return (
    <div>
      <p className="sub">Attacking notenest-henna.vercel.app</p>
      <div className="attack-lane" key={latest ? `${latest.id}-${beat}` : `beat-${beat}`} aria-hidden="true">
        <span className="gate" />
        <span className="ticket go">GET /</span>
        <span className="ticket go b">GET /api/orders</span>
        <span className="ticket halt">{route}</span>
        <p className="why">{why}</p>
      </div>
    </div>
  );
}

function Board({ snap }: { snap: EvalSnapshot }) {
  const s = snap.shield;
  const when = new Date(snap.generatedAt);
  const whenText = Number.isNaN(when.getTime()) ? snap.generatedAt : when.toLocaleString();
  const chalk = s.chalkDecisions ?? 0;
  const local = s.localDecisions ?? 0;
  const sessions = s.normalSessions ?? 0;
  return (
    <>
      <p className="sub">
        {whenText}
        {" · "}
        {snap.mode === "live" ? "Chalk scored the blocks" : "Local engine scored the blocks"}
        {" · "}
        {snap.host ? snap.host : snap.target === "sample-app" ? "Sample app" : "Local engine only"}
      </p>
      <div className="stats">
        <Stat label="Holes found" value={`${snap.scanner.found}/${snap.scanner.seeded}`} tone={snap.scanner.found === snap.scanner.seeded ? "good" : "warn"} />
        <Stat label="False alarms" value={String(snap.scanner.falseAlarms)} tone={snap.scanner.falseAlarms ? "bad" : "good"} />
        <Stat label="Attacks blocked" value={`${s.blocked}/${s.attacks}`} tone={s.blocked === s.attacks ? "good" : "bad"} />
        <Stat label="Normal requests blocked" value={`${s.wronglyBlocked}/${s.normal}`} tone={s.wronglyBlocked ? "bad" : "good"} />
      </div>
      <p className="sub">
        {sessions} normal sessions, {s.normal} requests. First block after about {s.requestsBeforeBlock} requests. p95 {s.p95Ms} ms.
        {chalk + local > 0 && ` ${chalk} blocked response${chalk === 1 ? "" : "s"} from Chalk, ${local} from the on-device engine.`}
      </p>
      <p className="sub">
        This run scores the deployed NoteNest. Fix proposals are not part of it.
      </p>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="stat">
      <b className={tone}>{value}</b>
      <span>{label}</span>
    </div>
  );
}
