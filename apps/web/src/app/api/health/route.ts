import { connection } from "next/server";
import { orchestratorUrl } from "@/lib/server";

/** Integration status from the orchestrator, so the UI can label live vs mock honestly. */
export async function GET() {
  await connection();
  try {
    const res = await fetch(new URL("health", orchestratorUrl()), { signal: AbortSignal.timeout(2000) });
    return Response.json({ orchestrator: "up", ...(await res.json()) });
  } catch {
    return Response.json({ orchestrator: "down" });
  }
}
