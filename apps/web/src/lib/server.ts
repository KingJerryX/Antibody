// Server-only helpers (imports node fs via @antibody/core). Never import from a client component.
import { connection } from "next/server";
import { readDb } from "@antibody/core";

export const ORCHESTRATOR_URL = process.env.ANTIBODY_ORCHESTRATOR_URL || "http://localhost:3001";

export function verifiedDomains(): string[] {
  return (process.env.ANTIBODY_VERIFIED_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

/** Store reads are synchronous fs reads; connection() keeps them out of build-time prerendering. */
export async function readStore() {
  await connection();
  return readDb();
}

/** Forward a request to the orchestrator; a clear 503 if it isn't running. */
export async function proxyToOrchestrator(path: string, body: unknown): Promise<Response> {
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    return new Response(await res.text(), { status: res.status, headers: { "content-type": res.headers.get("content-type") ?? "application/json" } });
  } catch {
    return Response.json(
      { error: `The Antibody orchestrator isn't reachable at ${ORCHESTRATOR_URL}. Start it with "npm run dev:orchestrator" and try again.` },
      { status: 503 },
    );
  }
}
