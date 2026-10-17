import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { connection } from "next/server";
import { Suspense } from "react";
import { Card } from "@/components/ui";

export const metadata = { title: "Evals | Antibody" };

interface EvalResults {
  generatedAt: string;
  mode: "mock" | "live";
  /** Optional: whether the shield replay hit the running sample app or only the in-process engine. */
  target?: "sample-app" | "local-engine";
  scanner: { seeded: number; found: number; falseAlarms: number };
  shield: { attacks: number; blocked: number; normal: number; wronglyBlocked: number; requestsBeforeBlock: number; p95Ms: number };
  fixes: { attempted: number; passed: number };
}

// next.config.ts loads env from ../.. too: the web app always runs with cwd = apps/web.
const RESULTS_PATH = resolve(process.cwd(), "../../evals/results.json");

export default function EvalsPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <p className="text-sm font-semibold uppercase tracking-widest text-mint">Scoreboard</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white sm:text-5xl">Does it actually work?</h1>
      <p className="mt-3 max-w-2xl text-slate-400">
        Measured against a seeded vulnerable app and replayed attack traffic, not vibes.
      </p>
      <Suspense fallback={<p className="mt-10 text-slate-500">Loading results…</p>}>
        <Results />
      </Suspense>
    </div>
  );
}

async function Results() {
  await connection();
  let r: EvalResults;
  try {
    r = JSON.parse(readFileSync(RESULTS_PATH, "utf8"));
  } catch {
    return (
      <Card className="mt-10 p-8">
        <h2 className="text-2xl font-semibold text-white">No eval run yet</h2>
        <p className="mt-2 text-slate-400">
          Start the sample app (<code className="font-mono text-slate-200">npm run dev:sample</code>, ports 4000 and 4001), then run the eval runner in{" "}
          <code className="font-mono text-slate-200">evals/</code>. It writes{" "}
          <code className="font-mono text-slate-200">evals/results.json</code> and this page picks it up on refresh.
        </p>
      </Card>
    );
  }

  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "n/a");
  const tiles = [
    { group: "Scanner", big: pct(r.scanner?.found, r.scanner?.seeded), label: "of seeded holes found", sub: `${r.scanner?.found}/${r.scanner?.seeded} found · ${r.scanner?.falseAlarms} false alarms`, good: r.scanner?.found >= r.scanner?.seeded },
    { group: "Shield", big: pct(r.shield?.blocked, r.shield?.attacks), label: "of attacks blocked", sub: `${r.shield?.blocked}/${r.shield?.attacks} attacks`, good: r.shield?.blocked >= r.shield?.attacks },
    { group: "Shield", big: pct(r.shield?.wronglyBlocked, r.shield?.normal), label: "of normal traffic wrongly blocked", sub: `${r.shield?.wronglyBlocked}/${r.shield?.normal} normal requests`, good: r.shield?.wronglyBlocked === 0 },
    { group: "Shield", big: String(r.shield?.requestsBeforeBlock ?? "n/a"), label: "attack requests before the block", sub: "Lower is better", good: r.shield?.requestsBeforeBlock <= 3 },
    { group: "Shield", big: `${r.shield?.p95Ms ?? "n/a"} ms`, label: "p95 added latency", sub: "Per request, in the hot path", good: r.shield?.p95Ms <= 50 },
    { group: "Fixes", big: pct(r.fixes?.passed, r.fixes?.attempted), label: "of fixes pass every check", sub: `${r.fixes?.passed}/${r.fixes?.attempted} fixes`, good: r.fixes?.passed >= r.fixes?.attempted },
  ];

  return (
    <>
      <div className="mt-8 flex flex-wrap items-center gap-3 text-sm">
        <span className={`rounded-full px-3 py-1 font-medium ${r.mode === "live" ? "bg-mint/10 text-mint" : "bg-amber-400/10 text-amber-200"}`}>
          {r.mode === "live" ? "Live run (Chalk)" : r.target === "sample-app" ? "Mock Chalk · live sample app" : "Mock run (no API keys)"}
        </span>
        <span className="text-slate-500">Generated {new Date(r.generatedAt).toLocaleString()}</span>
      </div>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <li key={t.label}>
            <Card className="h-full p-6">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{t.group}</p>
              <p className={`mt-3 text-5xl font-semibold tabular-nums ${t.good ? "text-mint" : "text-amber-200"}`}>{t.big}</p>
              <p className="mt-1 text-slate-200">{t.label}</p>
              <p className="mt-3 text-sm text-slate-500">{t.sub}</p>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
