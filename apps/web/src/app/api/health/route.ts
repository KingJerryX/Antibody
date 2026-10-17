import { after, connection } from "next/server";
import { orchestratorUrl, proxyToOrchestrator } from "@/lib/server";

/** Integration status from the orchestrator, so the UI can label live vs mock honestly.
 *  On Vercel the web app drafts the fix itself, so the button stays available when this check fails.
 */
export async function GET() {
  await connection();
  // Live and report pages poll this. That also wakes the iMessage inbox, which otherwise sleeps between requests.
  after(() => proxyToOrchestrator("/photon/poll", {}).then(() => undefined, () => undefined));
  try {
    const res = await fetch(new URL("health", orchestratorUrl()), { signal: AbortSignal.timeout(2000) });
    return Response.json({ ...(await res.json()), orchestrator: "up", fixes: "ready" });
  } catch (err) {
    const target = orchestratorUrl();
    let host = "unset";
    try {
      host = new URL(target).host;
    } catch {
      host = "invalid";
    }
    console.error(`[health] orchestrator unreachable (${host}): ${err instanceof Error ? err.message : "request failed"}`);
    return Response.json({ orchestrator: "down", fixes: process.env.VERCEL ? "ready" : "offline" });
  }
}
