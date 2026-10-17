// Connect Vercel: the Antibody Vercel Integration lists the owner's projects, the GitHub repo each deploys from,
// and its domains. Vercel only marks a domain verified once its owner proved control (DNS, or the project's own
// *.vercel.app name), so a verified domain on your project is proof you own that site. No verify-file PR needed.
// Integration env names avoid the VERCEL_ prefix, which Vercel reserves for its own system variables.

/** Set when Connect Vercel starts on our site, so the callback knows to come back to Your sites. */
export const VERCEL_COOKIE = "ab_vercel";

export const vercelIntegration = () => {
  const slug = process.env["ANTIBODY_VERCEL_INTEGRATION_SLUG"]?.trim();
  const id = process.env["ANTIBODY_VERCEL_CLIENT_ID"]?.trim();
  const secret = process.env["ANTIBODY_VERCEL_CLIENT_SECRET"]?.trim();
  return slug && id && secret ? { slug, id, secret } : undefined;
};

export interface VercelSite {
  /** "app.vercel.app" or a custom domain. */
  host: string;
  /** "owner/name" when the Vercel project deploys from GitHub. */
  repo?: string;
  vercelProject: string;
}

interface VercelProject {
  id: string;
  name: string;
  link?: { type?: string; org?: string; repo?: string };
}
interface VercelDomain {
  name: string;
  verified?: boolean;
  redirect?: string | null;
}

/** Verified, non-redirect domains of each project, one site per domain. Pure, so it is tested without Vercel. */
export function sitesFrom(projects: { project: VercelProject; domains: VercelDomain[] }[]): VercelSite[] {
  const out: VercelSite[] = [];
  for (const { project, domains } of projects) {
    const repo = project.link?.type === "github" && project.link.org && project.link.repo ? `${project.link.org}/${project.link.repo}` : undefined;
    for (const d of domains) {
      if (d.verified !== true || d.redirect) continue;
      out.push({ host: d.name.toLowerCase(), repo, vercelProject: project.name });
    }
  }
  return out;
}

const api = async <T>(path: string, token: string, teamId?: string): Promise<T> => {
  const url = new URL(`https://api.vercel.com${path}`);
  if (teamId) url.searchParams.set("teamId", teamId);
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Vercel ${path} failed (${res.status})`);
  return res.json() as Promise<T>;
};

/** The redirect URL's ?code, exchanged once, then every project and its domains. The token is not kept. */
export async function importVercelSites(code: string, redirectUri: string): Promise<VercelSite[]> {
  const integration = vercelIntegration();
  if (!integration) throw new Error("Connect Vercel isn't set up on this server.");
  const res = await fetch("https://api.vercel.com/v2/oauth/access_token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: integration.id, client_secret: integration.secret, code, redirect_uri: redirectUri }),
  });
  const token = (await res.json()) as { access_token?: string; team_id?: string | null };
  if (!res.ok || !token.access_token) throw new Error(`Vercel didn't connect (${res.status}).`);
  const teamId = token.team_id ?? undefined;
  // ponytail: first 100 projects; page with pagination.next if an owner has more.
  const { projects } = await api<{ projects: VercelProject[] }>("/v9/projects?limit=100", token.access_token, teamId);
  const withDomains = await Promise.all(
    projects.map(async (project) => ({
      project,
      domains: (await api<{ domains: VercelDomain[] }>(`/v9/projects/${encodeURIComponent(project.id)}/domains?limit=100`, token.access_token!, teamId).catch(() => ({ domains: [] }))).domains,
    })),
  );
  return sitesFrom(withDomains);
}
