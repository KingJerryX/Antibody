"use client";

import type { EvalSnapshot } from "@antibody/core";
import Link from "next/link";
import { usePoll } from "@/components/usePoll";

type Board = EvalSnapshot | { empty: true };

const isSnapshot = (b: Board): b is EvalSnapshot => "shield" in b;

export function EvalView() {
  const { data, error } = usePoll<Board>("/api/evals", 5000);

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
          Planted attacks should be blocked. Ordinary sessions, each making several requests, should not. A run counts as Chalk only when the blocked responses say so.
        </p>
        {error && <p className="alert">Couldn&apos;t load the scoreboard: {error}</p>}
        {!data && !error && <p className="sub">Loading…</p>}
        {data && !isSnapshot(data) && (
          <p className="sub">
            No eval run yet. With the sample app on ports 4000 and 4001, run <code>npm run eval</code>.
          </p>
        )}
        {data && isSnapshot(data) && <Board snap={data} />}
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
        {snap.target === "sample-app" ? "Sample app" : "Local engine only"}
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
      <p className="sub">This run scores the shield. Fix proposals are not part of it.</p>
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
