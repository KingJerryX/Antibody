// Antibody eval runner. Run: node --import tsx evals/run.ts
//
// Scores the local sample app behind the shield (http://localhost:4001, `npm run dev:shielded`).
// Scans that origin and replays attack + normal traffic against it, then writes evals/results.json,
// and publishes the run to the shared store when Supabase is keyed so the deployed /evals page shows it.
// Targets outside ANTIBODY_VERIFIED_DOMAINS are refused.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { hasRemoteStore, writeNamedRow, type EvalSnapshot, type FindingKind, type RequestCounts } from "@antibody/core";
import { scanUrl } from "@antibody/scanner";
import { proveIdorFix } from "./fix-proof.ts";
import { scoreScan, scoreShield } from "./metrics.ts";
import seededFile from "./seeded.json";

const here = dirname(fileURLToPath(import.meta.url));

/** The sample app with the shield on; this is the app the scoreboard measures. */
export const SHIELDED_ORIGIN = process.env.EVAL_TARGET ?? "http://localhost:4001";

/** One .env.local at the repo root; read the one var we need rather than pull in a dep. */
function verifiedFromEnv(): string[] {
  const raw = process.env.ANTIBODY_VERIFIED_DOMAINS ?? envFile("ANTIBODY_VERIFIED_DOMAINS");
  return (raw ?? "").split(",").map((d) => d.trim()).filter(Boolean);
}
function envFile(key: string): string | undefined {
  const path = join(here, "..", ".env.local");
  if (!existsSync(path)) return undefined;
  return readFileSync(path, "utf8").match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim();
}

const verifiedDomains = verifiedFromEnv();

function requireVerified(url: string) {
  const host = new URL(url).host;
  if (!verifiedDomains.includes(host)) {
    throw new Error(`Refusing to probe ${host}: not in ANTIBODY_VERIFIED_DOMAINS (${verifiedDomains.join(", ") || "none"})`);
  }
}

async function isUp(url: string): Promise<boolean> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(8_000) });
    return true;
  } catch {
    return false;
  }
}

type Hit = { status: number; source?: string; counts?: RequestCounts };

function asCounts(v: unknown): RequestCounts | undefined {
  if (!v || typeof v !== "object") return;
  const o = v as Record<string, unknown>;
  const num = (k: string) => (typeof o[k] === "number" && Number.isFinite(o[k] as number) ? (o[k] as number) : undefined);
  const method = typeof o.method === "string" ? o.method : "";
  const path = typeof o.path === "string" ? o.path : "";
  const distinctUsers = num("distinctUsers");
  const spanS = num("spanS");
  const routeRpm = num("routeRpm");
  const failedLogins = num("failedLogins");
  const loginAttempts = num("loginAttempts");
  const aiCalls = num("aiCalls");
  if (!method || !path || distinctUsers === undefined || spanS === undefined || routeRpm === undefined || failedLogins === undefined || loginAttempts === undefined || aiCalls === undefined) return;
  return { method, path, distinctUsers, spanS, routeRpm, failedLogins, loginAttempts, aiCalls };
}

/** Room between requests, so the windows the shield counts look like paced traffic rather than one burst. */
const GAP_MS = 600;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** One in-flight request at a time, with a gap. Passed into the scan so its parallel probes queue up too. */
let lastMs = 0;

function paced(base: typeof fetch): typeof fetch {
  let chain = Promise.resolve();
  return (input, init) => {
    const job = chain.then(async () => {
      await sleep(GAP_MS);
      const t0 = performance.now();
      // The caller's abort timer started when the request was queued. Start a fresh one now.
      const { signal: _drop, ...rest } = init ?? {};
      const res = await base(input, { ...rest, signal: AbortSignal.timeout(10_000) });
      lastMs = performance.now() - t0;
      return res;
    });
    chain = job.then(
      () => undefined,
      () => undefined,
    );
    return job;
  };
}

const pacedFetch = paced(fetch);

async function one(url: string, init?: RequestInit): Promise<Hit> {
  const res = await pacedFetch(url, { ...init, signal: AbortSignal.timeout(8_000) });
  const source = res.headers.get("x-antibody-shield")?.match(/source=(chalk|local|fail_open)/)?.[1];
  const body = await res.json().catch(() => null);
  return { status: res.status, source, counts: asCounts(body?.counts) };
}

async function hammer(origin: string, path: string, n: number, init?: RequestInit): Promise<Hit[]> {
  const hits: Hit[] = [];
  for (let i = 0; i < n; i++) {
    hits.push(await one(`${origin}${path.replace("{i}", String(i + 1))}`, init));
    if (hits.at(-1)!.status === 403 || hits.at(-1)!.status === 429) break;
  }
  return hits;
}

async function liveShield(origin: string) {
  requireVerified(origin);
  // Spoof x-forwarded-for so one machine looks like separate visitors. Normal traffic first, so a warm
  // shield can't leak attacker history onto a clean visitor.
  const normalSessions = 8;
  const normalStatuses: number[] = [];
  const normalMs: number[] = [];
  for (let i = 0; i < normalSessions; i++) {
    const headers = {
      "x-forwarded-for": `198.51.100.${i + 1}`,
      cookie: `session=visitor-${i}`,
      "content-type": "application/json",
    };
    const steps: { path: string; init: RequestInit }[] = [
      { path: `/api/users/${i + 1}`, init: { method: "GET" } },
      { path: `/api/users/${i + 1}`, init: { method: "GET" } },
      { path: "/api/chat", init: { method: "POST", body: "{}" } },
      { path: "/supabase/rest/v1/notes", init: { method: "GET", headers: { apikey: "anon-demo-key" } } },
    ];
    for (const step of steps) {
      const res = await one(`${origin}${step.path}`, { ...step.init, headers: { ...headers, ...step.init.headers } });
      normalMs.push(lastMs);
      normalStatuses.push(res.status);
    }
  }

  const run = Math.floor(Math.random() * 250) + 1;
  const attacker = (ip: string, rest: Record<string, string> = {}) => ({ "x-forwarded-for": ip.replace("203.0.113", `10.${run}.113`), ...rest });
  const idor = await hammer(origin, "/api/users/{i}", 12, { headers: attacker("203.0.113.7", { cookie: "session=attacker-idor" }) });
  const chatFlood = await hammer(origin, "/api/chat", 15, {
    method: "POST",
    headers: attacker("203.0.113.8", { cookie: "session=attacker-chat", "content-type": "application/json" }),
    body: "{}",
  });
  const scrape = await hammer(origin, "/supabase/rest/v1/users?i={i}", 40, { headers: attacker("203.0.113.9", { apikey: "anon-demo-key" }) });
  const attacks = [idor, chatFlood, scrape];
  const decisions = attacks.flat().filter((h) => h.source);
  const idorCounts = [...idor].reverse().find((h) => h.counts?.path.includes("/api/users/"))?.counts ?? null;
  return {
    idorCounts,
    ...scoreShield(
      attacks.map((h) => h.map((x) => x.status)),
      normalStatuses,
      normalMs,
    ),
    normalSessions,
    chalkDecisions: decisions.filter((h) => h.source === "chalk").length,
    localDecisions: decisions.filter((h) => h.source !== "chalk").length,
  };
}

/** Scan the shielded sample and replay the shield traffic. Throws if the host is not verified or not up. */
export async function runEval(origin = SHIELDED_ORIGIN): Promise<EvalSnapshot> {
  const base = origin.replace(/\/$/, "");
  requireVerified(base);
  if (!(await isUp(base))) throw new Error(`${base} is not responding`);
  await one(`${base}/`);
  const seeded = seededFile.holes as FindingKind[];
  const report = await scanUrl(`${base}/`, { projectId: "eval", verifiedDomains, fetchImpl: pacedFetch });
  const kinds = report.findings.map((f) => f.kind);
  const scanner = scoreScan(seeded, kinds);
  const { idorCounts, ...shield } = await liveShield(base);
  const proof = await proveIdorFix(async () => idorCounts).catch((err: unknown) => ({
    attempted: 1,
    passed: 0,
    note: err instanceof Error ? err.message : "Fix replay failed",
  }));
  const mode: EvalSnapshot["mode"] = shield.chalkDecisions > 0 && shield.localDecisions === 0 ? "live" : "mock";
  console.log(`Scan: found ${scanner.found}/${scanner.seeded} seeded holes (${kinds.join(", ")}), ${scanner.falseAlarms} false alarms.`);
  console.log(`Shield (${mode} Chalk, ${base}): blocked ${shield.blocked}/${shield.attacks} after ~${shield.requestsBeforeBlock} reqs, wrongly blocked ${shield.wronglyBlocked}/${shield.normal} normal (${shield.normalSessions} sessions), chalk ${shield.chalkDecisions}, local ${shield.localDecisions}, p95 ${shield.p95Ms}ms.`);
  return {
    generatedAt: new Date().toISOString(),
    mode,
    target: "sample-app",
    host: new URL(base).host,
    scanner,
    shield,
    fixes: { attempted: proof.attempted, passed: proof.passed },
    fixNote: proof.note,
  };
}

const invoked = process.argv[1]?.replaceAll("\\", "/").endsWith("evals/run.ts");

if (invoked) {
  runEval()
    .then(async (results) => {
      const path = join(here, "results.json");
      writeFileSync(path, JSON.stringify(results, null, 2));
      console.log(`Wrote ${path} (mode: ${results.mode}, host: ${results.host}).`);
      // The deployed /evals page reads this row first, so publish there too when the shared store is keyed.
      if (hasRemoteStore()) {
        await writeNamedRow("eval-snapshot", results);
        console.log("Published the run to the shared store (the deployed /evals page).");
      }
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
