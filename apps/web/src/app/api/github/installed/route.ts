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

  const granted = new Set(repos.map((r) => r.full_name.toLowerCase()));
  const attached = await updateDb((db) => {
    let first: string | undefined;
    const p = state?.p ? db.projects.find((x) => x.id === state.p && x.ownerId === user.id) : undefined;
    if (p) {
      p.githubInstallationId = installationId;
      // Keep the repo the site already deploys from (Vercel) if granted; else one repo granted is the repo; else ask.
      p.repo = p.repo && granted.has(p.repo.toLowerCase()) ? p.repo : only;
      first = p.id;
    }
    // The same install also covers this owner's other sites that deploy from the granted repos.
    for (const x of db.projects) {
      if (x.ownerId === user.id && x.repo && !x.githubInstallationId && granted.has(x.repo.toLowerCase())) {
        x.githubInstallationId = installationId;
        first ??= x.id;
      }
    }
    return first;
  });
  if (attached) return Response.redirect(`${webUrl()}/connect/${attached}`, 302);

  const projectId = await updateDb((db) => {
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
