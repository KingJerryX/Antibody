import { cookies } from "next/headers";
import { installationRepos, readDb, updateDb } from "@antibody/core";
import { cookie, currentUser, projectIdFor, signInRedirect, unsign } from "@/lib/auth";
import { webUrl } from "@/lib/server";
import { VERCEL_COOKIE, importVercelSites } from "@/lib/vercel";

/**
 * Vercel redirects here after the integration is installed (?code, ?configurationId, ?next). Every verified domain
 * on the owner's Vercel projects becomes one of their sites, already proven, linked to the repo it deploys from.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  if (!code) return Response.json({ error: "Missing code from Vercel" }, { status: 400 });
  const user = await currentUser();
  if (!user) return signInRedirect(request);

  let sites;
  try {
    sites = await importVercelSites(code, `${webUrl()}/api/vercel/callback`);
  } catch (err) {
    return Response.redirect(`${webUrl()}/sites?vercelError=${encodeURIComponent(err instanceof Error ? err.message : "Vercel didn't connect")}`, 302);
  }

  // Repos this owner already granted to the Antibody GitHub App, so a site's repo can be linked right away.
  const db = await readDb();
  const installs = [...new Set(db.projects.filter((p) => p.ownerId === user.id && p.githubInstallationId).map((p) => p.githubInstallationId!))];
  const granted = new Map<string, number>();
  for (const id of installs) for (const r of await installationRepos(id).catch(() => [])) granted.set(r.full_name.toLowerCase(), id);

  const now = new Date().toISOString();
  await updateDb((d) => {
    for (const site of sites) {
      const id = projectIdFor(site.host, user);
      let p = d.projects.find((x) => x.id === id);
      if (!p) {
        p = { id, name: site.host, url: `https://${site.host}`, verifiedDomain: true, createdAt: now, ownerId: user.id, ownerLogin: user.login };
        d.projects.push(p);
      }
      p.verifiedDomain = true;
      delete p.verifyPrUrl;
      const install = site.repo ? granted.get(site.repo.toLowerCase()) : undefined;
      if (site.repo && !p.repo) p.repo = site.repo;
      if (install && p.repo?.toLowerCase() === site.repo?.toLowerCase()) p.githubInstallationId = install;
    }
  });

  // Started from Antibody: back to Your sites. Started from the Vercel dashboard: back to Vercel.
  const startedHere = unsign<{ u: number }>((await cookies()).get(VERCEL_COOKIE)?.value)?.u === user.id;
  const next = params.get("next");
  const location = startedHere || !next?.startsWith("https://vercel.com/") ? `${webUrl()}/sites?vercel=${sites.length}` : next;
  return new Response(null, { status: 302, headers: { location, "set-cookie": cookie(VERCEL_COOKIE, "", 0) } });
}
