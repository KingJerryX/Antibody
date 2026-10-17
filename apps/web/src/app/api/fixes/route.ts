import { asFinding, proposeFix } from "@/lib/prod-fix";
import { canFixProject, proxyToOrchestrator, readStore } from "@/lib/server";

export async function POST(request: Request) {
  const b = await request.json().catch(() => null);
  if (typeof b?.findingId !== "string" || !b.findingId) return Response.json({ error: "findingId is required" }, { status: 400 });

  // No code, no fix: without a connected repo there is nothing real to patch, so refuse instead of drafting one.
  const db = await readStore();
  const finding = db.scans.flatMap((s) => s.findings).find((f) => f.id === b.findingId) ?? asFinding(b.finding);
  const projectId = finding?.projectId;
  if (!canFixProject(db.projects.find((p) => p.id === projectId))) {
    return Response.json(
      { error: "Connect this site's GitHub repo first. Antibody only fixes code it can see.", connectUrl: projectId ? `/connect/${projectId}` : undefined },
      { status: 409 },
    );
  }

  // Deployed without an orchestrator (no ANTIBODY_ORCHESTRATOR_URL): the mock fixer drafts here, from the browser's copy.
  if (process.env.VERCEL && !process.env["ANTIBODY_ORCHESTRATOR_URL"]) {
    const posted = asFinding(b.finding);
    if (!posted || posted.id !== b.findingId) return Response.json({ error: "The report for this finding is missing. Scan again, then fix it." }, { status: 400 });
    try {
      return Response.json(await proposeFix(posted), { status: 201 });
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : "Couldn't start the fix" }, { status: 500 });
    }
  }

  return proxyToOrchestrator("/fixes", { findingId: b.findingId });
}
