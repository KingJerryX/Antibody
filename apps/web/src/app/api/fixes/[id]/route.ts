import { readStore } from "@/lib/server";

// The orchestrator writes fixes to the shared store, so the web app reads them directly.
export async function GET(_req: Request, ctx: RouteContext<"/api/fixes/[id]">) {
  const { id } = await ctx.params;
  const db = await readStore();
  const fix = db.fixes.find((f) => f.id === id);
  if (!fix) return Response.json({ error: "Fix not found" }, { status: 404 });
  // The scan the finding came from, so the fix page can link back to the rest of that report.
  const scanId = db.scans.findLast((s) => s.findings.some((f) => f.id === fix.findingId))?.id;
  return Response.json({ ...fix, scanId });
}
