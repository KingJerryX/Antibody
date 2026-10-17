// Server-only helpers (imports node fs via @antibody/core). Never import from a client component.
import { connection } from "next/server";
import { resolve } from "node:path";
import { readDb, repoRoot } from "@antibody/core";

/**
 * Orchestrator base URL, with a trailing slash.
 * Vercel injects ANTIBODY_ORCHESTRATOR_URL from the web → orchestrator binding.
 * That value exists only at function runtime, so read it per request (a module-level
 * capture would freeze the localhost fallback at build time). Bracket access keeps
 * Next from inlining the missing build-time value.
 */
export function orchestratorUrl(): string {
  const raw = process.env["ANTIBODY_ORCHESTRATOR_URL"] || "http://localhost:3001";
  return raw.endsWith("/") ? raw : `${raw}/`;
}

export function verifiedDomains(): string[] {
  return (process.env.ANTIBODY_VERIFIED_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Source folder for a verified host, from ANTIBODY_REPOS ("localhost:4000=samples/vuln-app,...").
 * ponytail: local folders for the demo; a GitHub App clone replaces this once PR checks exist.
 */
export function repoDirFor(host: string): string | undefined {
  if (!verifiedDomains().includes(host.toLowerCase())) return undefined;
  for (const pair of (process.env.ANTIBODY_REPOS ?? "").split(",")) {
    const [h, dir] = pair.split("=").map((s) => s.trim());
    if (h?.toLowerCase() === host.toLowerCase() && dir) return resolve(repoRoot(), dir);
  }
}

/** Store reads are synchronous fs reads; connection() keeps them out of build-time prerendering. */
export async function readStore() {
  await connection();
  return readDb();
}

/** Forward a request to the orchestrator; a clear 503 if it isn't running. */
export async function proxyToOrchestrator(path: string, body: unknown): Promise<Response> {
  const base = orchestratorUrl();
  try {
    const res = await fetch(new URL(path.replace(/^\//, ""), base), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    return new Response(await res.text(), { status: res.status, headers: { "content-type": res.headers.get("content-type") ?? "application/json" } });
  } catch {
    return Response.json(
      { error: `The Antibody orchestrator isn't reachable at ${base}. Start it with "npm run dev:orchestrator" and try again.` },
      { status: 503 },
    );
  }
}
