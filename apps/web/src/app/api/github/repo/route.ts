import { installationRepos, readDb, updateDb } from "@antibody/core";
import { webUrl } from "@/lib/server";

/** Setup page form: choose which of the installation's repos belongs to this project. */
export async function POST(request: Request) {
  const form = await request.formData();
  const projectId = String(form.get("projectId") ?? "");
  const repo = String(form.get("repo") ?? "");
  const project = readDb().projects.find((p) => p.id === projectId);
  if (!project?.githubInstallationId) return Response.json({ error: "Connect GitHub first" }, { status: 400 });

  const allowed = await installationRepos(project.githubInstallationId);
  if (!allowed.some((r) => r.full_name === repo)) return Response.json({ error: "That repo isn't in the installation" }, { status: 400 });

  updateDb((db) => {
    const p = db.projects.find((x) => x.id === projectId);
    if (p) p.repo = repo;
  });
  return Response.redirect(`${webUrl()}/connect/${projectId}`, 303);
}
