import { canFixProject, readStore } from "@/lib/server";

export async function GET(_req: Request, ctx: RouteContext<"/api/scan/[id]">) {
  const { id } = await ctx.params;
  const db = await readStore();
  const scan = db.scans.find((s) => s.id === id);
  if (!scan) return Response.json({ error: "Scan not found" }, { status: 404 });
  // canFix: the report offers "Fix it" only when Antibody can see the code (connected repo).
  // fixes: the latest fix per finding, so the report links to it instead of starting another.
  const ids = new Set(scan.findings.map((f) => f.id));
  const fixes = Object.fromEntries(db.fixes.filter((f) => ids.has(f.findingId) && f.status !== "rejected").map((f) => [f.findingId, { id: f.id, status: f.status }]));
  return Response.json({ ...scan, canFix: canFixProject(db.projects.find((p) => p.id === scan.projectId)), fixes });
}
