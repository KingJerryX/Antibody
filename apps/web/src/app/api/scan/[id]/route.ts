import { canFixProject, readStore } from "@/lib/server";

export async function GET(_req: Request, ctx: RouteContext<"/api/scan/[id]">) {
  const { id } = await ctx.params;
  const db = await readStore();
  const scan = db.scans.find((s) => s.id === id);
  if (!scan) return Response.json({ error: "Scan not found" }, { status: 404 });
  // canFix: the report offers "Fix it" only when Antibody can see the code (connected repo).
  return Response.json({ ...scan, canFix: canFixProject(db.projects.find((p) => p.id === scan.projectId)) });
}
