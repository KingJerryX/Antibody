import { asFinding, proposeFix } from "@/lib/prod-fix";
import { proxyToOrchestrator } from "@/lib/server";

export async function POST(request: Request) {
  const b = await request.json().catch(() => null);
  if (typeof b?.findingId !== "string" || !b.findingId) return Response.json({ error: "findingId is required" }, { status: 400 });

  // The orchestrator keeps fixes in the same JSON file as this app, which is true on one machine and false on Vercel.
  // There the scan report lives in the browser, so the fix is drafted here from that finding.
  if (process.env.VERCEL) {
    const finding = asFinding(b.finding);
    if (!finding || finding.id !== b.findingId) return Response.json({ error: "The report for this finding is missing. Scan again, then fix it." }, { status: 400 });
    try {
      return Response.json(proposeFix(finding), { status: 201 });
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : "Couldn't start the fix" }, { status: 500 });
    }
  }

  return proxyToOrchestrator("/fixes", { findingId: b.findingId });
}
