// Antibody eval runner. Run: node --import tsx evals/run.ts
//
// Starts nothing itself. It expects the sample app running twice (see printed instructions):
//   npm run dev:sample                 -> http://localhost:4000  (unprotected)
//   npm run dev -w @antibody/vuln-app -- (dev:protected script)   -> http://localhost:4001 (shield on)
//
// It then: scans 4000 and compares to seeded.json; replays attack + normal traffic against 4001;
// writes evals/results.json. Targets outside ANTIBODY_VERIFIED_DOMAINS are refused.
// If the sample app isn't up, it unit-scores the shield's local engine instead and says so.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { FindingKind } from "@antibody/core";
import { scanUrl } from "@antibody/scanner";
import { evaluate, resetShield, type RequestContext } from "@antibody/shield";
import { scoreScan, scoreShield } from "./metrics.ts";

const here = dirname(fileURLToPath(import.meta.url));

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

const UNPROTECTED = "http://localhost:4000";
const PROTECTED = "http://localhost:4001";
const verifiedDomains = verifiedFromEnv();

function requireVerified(url: string) {
  const host = new URL(url).host;
  if (!verifiedDomains.includes(host)) {
    throw new Error(`Refusing to probe ${host}: not in ANTIBODY_VERIFIED_DOMAINS (${verifiedDomains.join(", ") || "none"})`);
  }
}

async function isUp(url: string): Promise<boolean> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(1500) });
    return true;
  } catch {
    return false;
  }
}

// --- attack + normal traffic (only ever against PROTECTED, which is verified) ------------------

async function hammer(path: string, n: number, init?: RequestInit): Promise<number[]> {
  const statuses: number[] = [];
  for (let i = 0; i < n; i++) {
    const res = await fetch(`${PROTECTED}${path.replace("{i}", String(i + 1))}`, init);
    statuses.push(res.status);
    if (res.status === 403 || res.status === 429) break; // stop once blocked, like a real attacker's tool would notice
  }
  return statuses;
}

async function liveShield() {
  requireVerified(PROTECTED);
  // All eval traffic leaves one machine, so spoof x-forwarded-for to model separate visitors:
  // one attacker IP per attack, a unique IP per normal visitor. Normal traffic first, so a warm
  // shield (state carried from a previous run) can't leak attacker history onto a clean visitor.
  const normalStatuses: number[] = [];
  const normalMs: number[] = [];
  const paths = ["/api/users/{i}", "/supabase/rest/v1/notes", "/api/chat"];
  for (let i = 0; i < 20; i++) {
    const p = paths[i % paths.length].replace("{i}", String(i + 1));
    const t0 = performance.now();
    const res = await fetch(`${PROTECTED}${p}`, {
      method: p.includes("chat") ? "POST" : "GET",
      headers: {
        "x-forwarded-for": `198.51.100.${i + 1}`,
        cookie: `session=visitor-${i}`,
        "content-type": "application/json",
        ...(p.includes("supabase") ? { apikey: "anon-demo-key" } : {}),
      },
      body: p.includes("chat") ? "{}" : undefined,
    });
    normalMs.push(performance.now() - t0);
    normalStatuses.push(res.status);
  }

  // Fresh attacker IPs each run, so a warm shield doesn't block them on request 0 and skew requestsBeforeBlock.
  const run = Math.floor(Math.random() * 250) + 1;
  const attacker = (ip: string, rest: Record<string, string> = {}) => ({ "x-forwarded-for": ip.replace("203.0.113", `10.${run}.113`), ...rest });
  const idor = await hammer("/api/users/{i}", 12, { headers: attacker("203.0.113.7", { cookie: "session=attacker-idor" }) });
  const chatFlood = await hammer("/api/chat", 15, {
    method: "POST",
    headers: attacker("203.0.113.8", { cookie: "session=attacker-chat", "content-type": "application/json" }),
    body: "{}",
  });
  const scrape = await hammer("/supabase/rest/v1/users?i={i}", 40, { headers: attacker("203.0.113.9", { apikey: "anon-demo-key" }) });

  return scoreShield([idor, chatFlood, scrape], normalStatuses, normalMs);
}

// --- fallback: unit-score the local engine with synthetic traffic (no sample app) --------------

async function engineShield() {
  resetShield();
  const T0 = 1_700_000_000_000;
  const ctx = (pathname: string, i: number, extra: Partial<RequestContext> = {}): RequestContext => ({
    method: "GET",
    pathname,
    ip: "10.0.0.5",
    sessionId: "attacker",
    at: T0 + i * 2000,
    ...extra,
  });
  const run = async (make: (i: number) => RequestContext, n: number) => {
    resetShield();
    const statuses: number[] = [];
    for (let i = 1; i <= n; i++) {
      const d = await evaluate(make(i));
      statuses.push(d.action === "block" ? 403 : d.action === "challenge" ? 429 : 200);
      if (d.action !== "allow") break;
    }
    return statuses;
  };
  const idor = await run((i) => ctx(`/api/users/${i}`, i), 12);
  const chat = await run((i) => ctx("/api/chat", i, { method: "POST", at: T0 + i * 400 }), 15);
  // A scrape is fast: ~150ms between hits, so well over ROUTE_RPM land inside the 1-min window.
  const scrape = await run((i) => ctx("/supabase/rest/v1/users", i, { sessionId: undefined, ip: "10.0.0.6", at: T0 + i * 150 }), 40);

  resetShield();
  const normalStatuses: number[] = [];
  const normalMs: number[] = [];
  for (let u = 0; u < 20; u++) {
    const t0 = performance.now();
    const d = await evaluate({ method: "GET", pathname: `/api/users/${u}`, ip: `10.1.0.${u}`, sessionId: `user-${u}`, at: T0 + u * 1000 });
    normalMs.push(performance.now() - t0);
    normalStatuses.push(d.action === "allow" ? 200 : 403);
  }
  return scoreShield([idor, chat, scrape], normalStatuses, normalMs);
}

async function main() {
  const seeded: FindingKind[] = JSON.parse(readFileSync(join(here, "seeded.json"), "utf8")).holes;
  const up4000 = await isUp(UNPROTECTED);
  const up4001 = await isUp(PROTECTED);

  console.log(up4000 && up4001 ? "Sample app detected on 4000 + 4001." : "Sample app not fully up. Start it with:");
  if (!up4000 || !up4001) {
    console.log("  npm run dev:sample");
    console.log("  npm run dev:protected -w @antibody/vuln-app");
  }

  let scanner = { seeded: seeded.length, found: 0, falseAlarms: 0 };
  if (up4000) {
    requireVerified(UNPROTECTED);
    const report = await scanUrl(UNPROTECTED, { projectId: "eval", verifiedDomains });
    const kinds = report.findings.map((f) => f.kind);
    scanner = scoreScan(seeded, kinds);
    console.log(`Scan: found ${scanner.found}/${scanner.seeded} seeded holes (${kinds.join(", ")}), ${scanner.falseAlarms} false alarms.`);
  } else {
    console.log("Skipping scan: 4000 not up.");
  }

  // "live" means the shield on 4001 really consulted Chalk. Live servers with no Chalk keys = local engine = mock.
  const chalkKeys = ["CHALK_CLIENT_ID", "CHALK_CLIENT_SECRET"].every((k) => (process.env[k] ?? envFile(k) ?? "").trim() !== "");
  const mode: "mock" | "live" = up4001 && chalkKeys && process.env.ANTIBODY_MOCK !== "on" ? "live" : "mock";
  const target: "sample-app" | "local-engine" = up4001 ? "sample-app" : "local-engine";
  const shield = up4001 ? await liveShield() : await engineShield();
  console.log(`Shield (${mode} Chalk, ${target}): blocked ${shield.blocked}/${shield.attacks} attacks after ~${shield.requestsBeforeBlock} reqs, wrongly blocked ${shield.wronglyBlocked}/${shield.normal} normal, p95 ${shield.p95Ms}ms.`);

  const results = {
    generatedAt: new Date().toISOString(),
    mode,
    target,
    scanner,
    shield,
    // No automated fixer loop in the eval yet; the orchestrator owns fixes.
    fixes: { attempted: 0, passed: 0 },
  };
  writeFileSync(join(here, "results.json"), JSON.stringify(results, null, 2));
  console.log(`Wrote ${join(here, "results.json")} (mode: ${mode}, target: ${target}).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
