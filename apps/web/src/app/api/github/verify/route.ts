import { openVerifyPullRequest, updateDb } from "@antibody/core";
import { readStore, webUrl } from "@/lib/server";

/** Setup page form: open the pull request that adds the ownership file, then back to the page. */
export async function POST(request: Request) {
  const form = await request.formData();
  const projectId = String(form.get("projectId") ?? "");
  const page = new URL(`${webUrl()}/connect/${encodeURIComponent(projectId)}`);
  const project = (await readStore()).projects.find((p) => p.id === projectId);
  if (!project) return Response.json({ error: "Unknown project" }, { status: 404 });
  try {
    const url = await openVerifyPullRequest(project);
    await updateDb((db) => {
      const p = db.projects.find((x) => x.id === projectId);
      if (p) p.verifyPrUrl = url;
    });
  } catch (err) {
    page.searchParams.set("verifyError", (err instanceof Error ? err.message : "Couldn't open the pull request").slice(0, 300));
  }
  return Response.redirect(page, 303);
}
