import { connection } from "next/server";
import { json, ORCHESTRATOR_URL } from "@/lib/server";

/** Integration status from the orchestrator, so the UI can label live vs mock honestly. */
export async function GET() {
  await connection();
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return json({ orchestrator: "up", ...(await res.json()) });
  } catch {
    return json({ orchestrator: "down" });
  }
}
