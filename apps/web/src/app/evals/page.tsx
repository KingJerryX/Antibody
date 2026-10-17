import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

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

type Tone = "ok" | "warn" | "bad" | "idle";

// next.config.ts loads env from ../.. too: the web app always runs with cwd = apps/web.
const RESULTS_PATH = resolve(process.cwd(), "../../evals/results.json");

export default function EvalsPage() {
  return (
    <div className="ab">
      <div className="wrap page">
        <nav className="crumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span aria-hidden="true">/</span>
          <span>Evals</span>
        </nav>
        <p className="kicker">Scoreboard</p>
        <h1 className="display">The demo, measured.</h1>
        <Suspense fallback={<p className="sub">Loading results…</p>}>
          <Results />
        </Suspense>
      </div>
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
      <>
        <p className="sub">No eval run yet. Start the sample app, run the eval, then refresh.</p>
        <div className="run">
          <h2>How to fill this in</h2>
          <p>The runner writes evals/results.json. This page reads that file.</p>
          <pre>{`npm run dev:sample\nnpm run dev:protected -w @antibody/vuln-app\nnpm run eval`}</pre>
        </div>
      </>
    );
  }

  const scanner = r.scanner ?? { seeded: 0, found: 0, falseAlarms: 0 };
  const shield = r.shield ?? { attacks: 0, blocked: 0, normal: 0, wronglyBlocked: 0, requestsBeforeBlock: 0, p95Ms: 0 };
  const fixes = r.fixes ?? { attempted: 0, passed: 0 };
  const when = r.generatedAt ? new Date(r.generatedAt).toLocaleString() : "unknown time";
  const live = r.mode === "live";
  const chip = live ? "Live · Chalk" : r.target === "sample-app" ? "Mock Chalk · sample app" : "Local engine";
  const blurb =
    r.target === "local-engine"
      ? "The sample app was down, so this run scored the shield in process."
      : live
        ? "Latest run against the sample app. Chalk was live."
        : "Latest run against the sample app. Chalk was mocked.";

  const scannerTone: Tone = scanner.falseAlarms > 0 || (scanner.seeded > 0 && scanner.found === 0) ? "bad" : scanner.found < scanner.seeded ? "warn" : scanner.seeded ? "ok" : "idle";
  const shieldTone: Tone = !shield.attacks ? "idle" : shield.blocked < shield.attacks || shield.wronglyBlocked > 0 ? "bad" : "ok";
  const fixesTone: Tone = !fixes.attempted ? "idle" : fixes.passed >= fixes.attempted ? "ok" : "warn";
  const beforeTone: Tone = shield.requestsBeforeBlock <= 3 ? "ok" : "warn";
  const latencyTone: Tone = shield.p95Ms <= 50 ? "ok" : "warn";

  return (
    <>
      <p className="sub">{blurb}</p>
      <div className="evals-meta">
        <span className={live ? "status go" : "status"}>{chip}</span>
        <span className="host">Generated {when}</span>
      </div>
      <div className="cards evals-cards">
        <article>
          <p className={`figure ${scannerTone}`}>{scanner.seeded ? `${scanner.found}/${scanner.seeded}` : "n/a"}</p>
          <div className="mini">
            <div className="metric"><span>planted holes found</span><span className={scanner.found >= scanner.seeded && scanner.seeded ? "good" : "warn"}>{scanner.found}</span></div>
            <div className="metric"><span>false alarms</span><span className={scanner.falseAlarms === 0 ? "good" : "bad"}>{scanner.falseAlarms}</span></div>
          </div>
          <h2>Scanner</h2>
          <p>Compared with the holes planted in the sample app.</p>
        </article>
        <article>
          <p className={`figure ${shieldTone}`}>{shield.attacks ? `${shield.blocked}/${shield.attacks}` : "n/a"}</p>
          <div className="mini">
            <div className="metric"><span>attacks blocked</span><span className={shield.blocked >= shield.attacks && shield.attacks ? "good" : "bad"}>{shield.blocked}/{shield.attacks}</span></div>
            <div className="metric"><span>normal requests blocked</span><span className={shield.wronglyBlocked === 0 ? "good" : "bad"}>{shield.wronglyBlocked}/{shield.normal}</span></div>
            <div className="metric"><span>requests before a block</span><span className={beforeTone}>{shield.requestsBeforeBlock}</span></div>
            <div className="metric"><span>p95 latency</span><span className={latencyTone}>{Math.round(shield.p95Ms)} ms</span></div>
          </div>
          <h2>Shield</h2>
          <p>{r.target === "local-engine" ? "Scored in process. The protected app was not up." : "Attack traffic and ordinary requests, replayed on the protected app."}</p>
        </article>
        <article>
          <p className={`figure ${fixesTone}`}>{fixes.attempted ? `${fixes.passed}/${fixes.attempted}` : "n/a"}</p>
          <div className="mini">
            <div className="metric"><span>attempted</span><span>{fixes.attempted}</span></div>
            <div className="metric"><span>passed</span><span className={fixes.attempted ? fixesTone : undefined}>{fixes.passed}</span></div>
          </div>
          <h2>Fixes</h2>
          <p>{fixes.attempted ? "Fixes that passed every check in the run." : "Not scored yet. This run does not include the fixer."}</p>
        </article>
      </div>
      <p className="evals-foot">From <code>evals/results.json</code>. Run <code>npm run eval</code>, then refresh.</p>
    </>
  );
}
