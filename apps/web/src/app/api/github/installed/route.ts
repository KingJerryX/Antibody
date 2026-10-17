import { getInstallation, installationRepos, newId, updateDb } from "@antibody/core";
import { webUrl } from "@/lib/server";
import { currentUser, signInRedirect, unsign, type InstallState } from "@/lib/auth";

/**
 * GitHub redirects here after the app is installed, with installation_id and our signed state
 * (who started the install, and for which project). Only that signed-in user's own project is changed.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const installationId = Number(params.get("installation_id"));
  if (!installationId) return Response.json({ error: "Missing installation_id" }, { status: 400 });
  // Installs started on github.com have no state; sign in first, then come back to this same URL.
  const user = await currentUser();
  if (!user) return signInRedirect(request);
  const state = unsign<InstallState>(params.get("state") ?? undefined);
  if (state && state.u !== user.id) return Response.json({ error: "This install was started by a different account. Sign in as that account." }, { status: 403 });

  // Proves the installation is real and belongs to our app before trusting the id.
  const installation = await getInstallation(installationId);
  const repos = await installationRepos(installationId);
  const only = repos.length === 1 ? repos[0].full_name : undefined;

  const projectId = await updateDb((db) => {
    const p = state?.p ? db.projects.find((x) => x.id === state.p && x.ownerId === user.id) : undefined;
    if (p) {
      p.githubInstallationId = installationId;
      // One repo granted: that's the project's repo. Several: the setup page asks which one.
      p.repo = only ?? (repos.some((r) => r.full_name === p.repo) ? p.repo : undefined);
      return p.id;
    }
    // Installed with no project yet: start one for the repo; the first scan adds the site.
    const id = newId("proj");
    const login = installation.account.login;
    db.projects.push({
      id,
      name: only ?? login,
      url: `https://github.com/${only ?? login}`,
      repo: only,
      githubInstallationId: installationId,
      verifiedDomain: false,
      createdAt: new Date().toISOString(),
      ownerId: user.id,
      ownerLogin: user.login,
    });
    return id;
  });
  return Response.redirect(`${webUrl()}/connect/${projectId}`, 302);
}
