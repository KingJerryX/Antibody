// Antibody's GitHub App: created once from a manifest, then installed per project.
// Plain fetch + node:crypto; no SDK needed for the handful of calls we make.
import { createSign } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { cloneRepo, git, pushFixBranch } from "./git.ts";
import { hasRemoteStore, readNamedRow, repoRoot, writeNamedRow } from "./store.ts";
import type { FixCheck, FixProposal, Project } from "./types.ts";

/** What GitHub returns when the app is created. Holds the private key. */
export interface GithubApp {
  id: number;
  slug: string;
  name: string;
  html_url: string;
  pem: string;
}

const API = "https://api.github.com";
const APP_ROW = "github-app";
const appFile = () => join(resolve(repoRoot(), process.env.ANTIBODY_DATA_DIR ?? "data"), "github-app.json");

let cached: GithubApp | undefined;

function readAppFile(): GithubApp | undefined {
  try {
    return JSON.parse(readFileSync(appFile(), "utf8")) as GithubApp;
  } catch {
    return undefined;
  }
}

/** Local-dev signal for the orchestrator startup table. Production reads the Supabase row instead. */
export const githubAppOnDisk = () => Boolean(readAppFile()?.pem);

export async function readGithubApp(): Promise<GithubApp | undefined> {
  if (cached?.pem) return cached;
  const app = hasRemoteStore() ? await readNamedRow<GithubApp>(APP_ROW) : readAppFile();
  if (app?.pem) cached = app;
  return app;
}

export async function saveGithubApp(app: GithubApp): Promise<void> {
  // Only the fields we use; GitHub's response also carries client and webhook secrets we don't need.
  const saved: GithubApp = { id: app.id, slug: app.slug, name: app.name, html_url: app.html_url, pem: app.pem };
  if (hasRemoteStore()) await writeNamedRow(APP_ROW, saved);
  else {
    mkdirSync(dirname(appFile()), { recursive: true });
    writeFileSync(appFile(), JSON.stringify(saved, null, 2));
  }
  cached = saved;
}

/** Manifest for GitHub's "create an app from a manifest" flow. No webhook: localhost can't receive one. */
export function appManifest(webUrl: string) {
  return {
    name: "Antibody Security",
    description: "Scans your app, writes a fix, and opens a pull request for you to review.",
    url: webUrl,
    redirect_url: `${webUrl}/api/github/created`,
    setup_url: `${webUrl}/api/github/installed`,
    setup_on_update: true,
    public: false,
    hook_attributes: { url: `${webUrl}/api/github/webhook`, active: false },
    default_permissions: { contents: "write", pull_requests: "write", checks: "write", metadata: "read" },
    default_events: [],
  };
}

/** Exchanges the one-time code from the manifest redirect for the new app's credentials. */
export async function convertManifestCode(code: string): Promise<GithubApp> {
  const res = await fetch(`${API}/app-manifests/${encodeURIComponent(code)}/conversions`, { method: "POST", headers: ghHeaders() });
  if (!res.ok) throw new Error(`GitHub app creation failed (${res.status})`);
  return (await res.json()) as GithubApp;
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

/** Short-lived JWT that authenticates as the app itself (GitHub allows up to 10 minutes). */
function appJwt(app: GithubApp): string {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: app.id }))}`;
  return `${body}.${createSign("RSA-SHA256").update(body).sign(app.pem, "base64url")}`;
}

const ghHeaders = (token?: string) => ({
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

async function gh<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...ghHeaders(token), ...init.headers } });
  if (!res.ok) throw new Error(`GitHub ${init.method ?? "GET"} ${path} failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

async function requireApp(): Promise<GithubApp> {
  const app = await readGithubApp();
  if (!app) throw new Error("The Antibody GitHub App hasn't been created yet.");
  return app;
}

/** Throws unless the installation really belongs to our app (guards the install callback). */
export async function getInstallation(installationId: number): Promise<{ id: number; account: { login: string } }> {
  return gh(`/app/installations/${installationId}`, appJwt(await requireApp()));
}

/** Installation access token: acts on the repos the user granted, expires in an hour. */
export async function installationToken(installationId: number): Promise<string> {
  const { token } = await gh<{ token: string }>(`/app/installations/${installationId}/access_tokens`, appJwt(await requireApp()), { method: "POST" });
  return token;
}

export async function installationRepos(installationId: number): Promise<{ full_name: string; default_branch: string; private: boolean }[]> {
  const { repositories } = await gh<{ repositories: { full_name: string; default_branch: string; private: boolean }[] }>(
    "/installation/repositories?per_page=100",
    await installationToken(installationId),
  );
  return repositories;
}

/** Picks up a rename made in GitHub's app settings, so the install link follows the new slug. */
export async function refreshGithubApp(app: GithubApp): Promise<GithubApp> {
  const res = await fetch(`${API}/app`, { headers: ghHeaders(appJwt(app)) });
  if (!res.ok) return app;
  const live = (await res.json()) as { id?: number; slug?: string; name?: string; html_url?: string };
  if (!live.html_url || (live.slug === app.slug && live.name === app.name && live.html_url === app.html_url)) return app;
  const saved: GithubApp = { ...app, id: live.id ?? app.id, slug: live.slug || app.slug, name: live.name || app.name, html_url: live.html_url };
  await saveGithubApp(saved);
  return saved;
}

export const installUrl = (app: GithubApp, projectId: string) =>
  `${app.html_url.replace(/\/$/, "")}/installations/new?state=${encodeURIComponent(projectId)}`;

/** Git over HTTPS with an installation token: GitHub accepts it as the password for user "x-access-token". */
const gitAuth = (token: string) => `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`;

const connected = (project: Project): project is Project & { repo: string; githubInstallationId: number } =>
  Boolean(project.repo && project.githubInstallationId);

export const isGithubConnected = connected;

/** Fresh shallow clone of the project's connected repo into `dest`. */
export async function cloneProjectRepo(project: Project, dest: string): Promise<void> {
  if (!connected(project)) throw new Error(`${project.name} has no connected GitHub repo`);
  await cloneRepo(`https://github.com/${project.repo}.git`, dest, gitAuth(await installationToken(project.githubInstallationId)));
}

/** Commits are authored as the app's bot account so the PR shows "Antibody" rather than a person. */
async function botIdentity(app: GithubApp): Promise<{ name: string; email: string }> {
  const name = `${app.slug}[bot]`;
  const user = await fetch(`${API}/users/${encodeURIComponent(name)}`, { headers: ghHeaders() })
    .then((r) => (r.ok ? (r.json() as Promise<{ id: number }>) : undefined))
    .catch(() => undefined);
  return { name, email: `${user?.id ?? app.id}+${name}@users.noreply.github.com` };
}

/**
 * Opens a pull request with `fix.diff` on a new branch of the project's repo. Antibody never merges:
 * the owner reviews and merges in GitHub. Returns the PR's URL.
 */
export async function openPullRequest(project: Project, fix: FixProposal, title: string): Promise<string> {
  if (!connected(project)) throw new Error(`${project.name} has no connected GitHub repo`);
  const app = await requireApp();
  const token = await installationToken(project.githubInstallationId);
  const scratch = join(repoRoot(), ".antibody-work");
  mkdirSync(scratch, { recursive: true });
  const work = mkdtempSync(join(scratch, "pr-"));
  const dir = join(work, "repo");
  try {
    await cloneRepo(`https://github.com/${project.repo}.git`, dir, gitAuth(token));
    const base = (await git(dir, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    const branch = `antibody/${fix.id}`;
    await pushFixBranch(dir, { branch, diff: fix.diff, message: `Antibody: ${title}`, author: await botIdentity(app), authHeader: gitAuth(token) });
    const pr = await gh<{ html_url: string }>(`/repos/${project.repo}/pulls`, token, {
      method: "POST",
      body: JSON.stringify({ title: `Antibody: ${title}`, head: branch, base, body: prBody(fix) }),
    });
    return pr.html_url;
  } finally {
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
}

const CHECK_LABEL: Record<FixCheck["name"], string> = {
  exploit_test: "Exploit re-test",
  behavior_tests: "Behavior check",
  preview_replay: "Preview replay",
  second_review: "Code check",
};

function prBody(fix: FixProposal): string {
  const mark = { pass: "✅", fail: "❌", pending: "⏳", skipped: "➖" } as const;
  return [
    `**What was wrong:** ${fix.summary.whatWasWrong}`,
    `**What changes:** ${fix.summary.whatChanges}`,
    `**What your users notice:** ${fix.summary.whatUsersNotice}`,
    "",
    "### Checks Antibody ran on the patched app",
    ...fix.checks.map((c) => `- ${mark[c.status]} **${CHECK_LABEL[c.name]}:** ${c.detail}`),
    "",
    `Approved on Antibody (fix \`${fix.id}\`). Antibody never merges: review the diff and merge when you're happy.`,
  ].join("\n");
}
