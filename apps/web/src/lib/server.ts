// Server-only helpers (imports node fs via @antibody/core). Never import from a client component.
import { connection } from "next/server";
import { resolve } from "node:path";
import { isGithubConnected, readDb, repoRoot, type Project } from "@antibody/core";

/**
 * Orchestrator base URL, with a trailing slash.
 * On Vercel, ANTIBODY_ORCHESTRATOR_URL is the Chalk scaling group's HTTPS URL.
 * That value exists only at function runtime, so read it per request (a module-level
 * capture would freeze the localhost fallback at build time). Bracket access keeps
 * Next from inlining the missing build-time value.
 */
export function orchestratorUrl(): string {
  const raw = process.env["ANTIBODY_ORCHESTRATOR_URL"] || "http://localhost:3001";
  return raw.endsWith("/") ? raw : `${raw}/`;
}

/** This site's own base URL (GitHub redirects back to it). */
export const webUrl = () => (process.env.ANTIBODY_WEB_URL || "http://localhost:3000").replace(/\/$/, "");

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

/**
 * Whether Antibody has this project's code to fix: its connected GitHub repo, or (local dev) a folder from
 * ANTIBODY_REPOS. Without either there is nothing to patch, so the site must not offer a fix.
 */
export function canFixProject(project: Project | undefined): boolean {
  if (!project) return false;
  return isGithubConnected(project) || Boolean(repoDirFor(URL.parse(project.url)?.host ?? ""));
}

/** connection() keeps store reads (a file or Supabase) out of build-time prerendering. */
export async function readStore() {
  await connection();
  return readDb();
}

/** Forward a request to the orchestrator; a clear 503 if it isn't running. */
export async function proxyToOrchestrator(path: string, body: unknown): Promise<Response> {
  const base = orchestratorUrl();
  const token = process.env["ANTIBODY_ORCHESTRATOR_TOKEN"]?.trim();
  try {
    const res = await fetch(new URL(path.replace(/^\//, ""), base), {
      method: "POST",
      // The orchestrator rejects calls without this once it is reachable off localhost.
      headers: { "content-type": "application/json", ...(token && { authorization: `Bearer ${token}` }) },
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
