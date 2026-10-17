import { getInstallation, installationRepos, updateDb } from "@antibody/core";
import { webUrl } from "@/lib/server";

/**
 * GitHub redirects here after the app is installed, with installation_id and our state (the project id).
 * ponytail: state is the bare project id; sign it before this leaves localhost.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const installationId = Number(params.get("installation_id"));
  const projectId = params.get("state") ?? "";
  if (!installationId) return Response.json({ error: "Missing installation_id" }, { status: 400 });

  // Proves the installation is real and belongs to our app before trusting the id.
  await getInstallation(installationId);
  const repos = await installationRepos(installationId);

  const found = await updateDb((db) => {
    const p = db.projects.find((x) => x.id === projectId);
    if (!p) return false;
    p.githubInstallationId = installationId;
    // One repo granted: that's the project's repo. Several: the setup page asks which one.
    p.repo = repos.length === 1 ? repos[0].full_name : repos.some((r) => r.full_name === p.repo) ? p.repo : undefined;
    return true;
  });
  return Response.redirect(found ? `${webUrl()}/connect/${projectId}` : webUrl(), 302);
}
