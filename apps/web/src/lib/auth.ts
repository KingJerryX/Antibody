// Sign in with GitHub. The session is a signed cookie (no session table): who you are, nothing secret.
// Uses the Antibody GitHub App's own OAuth client (GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET).
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { Project } from "@antibody/core";

export interface SessionUser {
  /** GitHub user id. 0 is the local mock user. */
  id: number;
  login: string;
  avatar?: string;
  /** Local dev without OAuth keys: a stand-in user, labeled in the UI. */
  mock?: true;
}

export const SESSION_COOKIE = "ab_session";
export const OAUTH_COOKIE = "ab_oauth";
const MAX_AGE_S = 30 * 24 * 60 * 60;

function secret(): string {
  const s = process.env["ANTIBODY_SESSION_SECRET"]?.trim();
  if (s) return s;
  // Deployed, a guessable secret would let anyone forge a session.
  if (process.env.VERCEL) throw new Error("ANTIBODY_SESSION_SECRET is not set");
  return "antibody-local-dev-only";
}

const mac = (body: string) => createHmac("sha256", secret()).update(body).digest("base64url");

function sameMac(body: string, sig: string): boolean {
  const want = Buffer.from(mac(body));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** "<base64url json>.<hmac>" with an expiry inside, so an old cookie can't be replayed forever. */
export function sign(value: object, maxAgeS = MAX_AGE_S, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ ...value, exp: now + maxAgeS * 1000 })).toString("base64url");
  return `${body}.${mac(body)}`;
}

export function unsign<T>(token: string | undefined, now = Date.now()): T | undefined {
  const [body, sig] = (token ?? "").split(".");
  if (!body || !sig || !sameMac(body, sig)) return undefined;
  try {
    const value = JSON.parse(Buffer.from(body, "base64url").toString()) as T & { exp?: number };
    return typeof value.exp === "number" && value.exp > now ? value : undefined;
  } catch {
    return undefined;
  }
}

export async function currentUser(): Promise<SessionUser | undefined> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  // No secret configured yet (deployed): everyone is signed out, but scans and reports keep working.
  let u: SessionUser | undefined;
  try {
    u = unsign<SessionUser>(raw);
  } catch {
    return undefined;
  }
  return u && typeof u.id === "number" && typeof u.login === "string" ? { id: u.id, login: u.login, avatar: u.avatar, ...(u.mock && { mock: true }) } : undefined;
}

/** Set-Cookie value. Secure whenever the site itself is served over HTTPS. */
export function cookie(name: string, value: string, maxAgeS: number): string {
  const secure = (process.env.ANTIBODY_WEB_URL ?? "").startsWith("https://") || process.env.VERCEL ? "; Secure" : "";
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeS}${secure}`;
}
export const sessionCookie = (user: SessionUser) => cookie(SESSION_COOKIE, sign(user), MAX_AGE_S);

export const oauthClient = () => {
  const id = process.env["GITHUB_CLIENT_ID"]?.trim();
  const secret = process.env["GITHUB_CLIENT_SECRET"]?.trim();
  return id && secret ? { id, secret } : undefined;
};
/** Without OAuth keys, local dev signs in as a labeled mock user (AGENTS.md mock rule). Deployed, never. */
export const mockSignIn = () => !oauthClient() && !process.env.VERCEL;
export const MOCK_USER: SessionUser = { id: 0, login: "local-dev", mock: true };

/** Only same-site paths, so ?next= can't bounce a signed-in user to another site. */
export const safeNext = (next: string | null | undefined) => (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next.slice(0, 500) : "/sites");

export const newState = () => randomBytes(18).toString("base64url");

/** The project a signed-in user gets for a site. Anonymous scans share `proj_<host>`; owners get their own. */
export const projectIdFor = (host: string, user?: SessionUser) => {
  const base = `proj_${host.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return user ? `${base}-u${user.id}` : base;
};

export const owns = (user: SessionUser | undefined, project: Project | undefined): boolean =>
  Boolean(user && project && project.ownerId === user.id);

/** Send the browser to sign in, then back to exactly where it was going. */
export function signInRedirect(request: Request): Response {
  const u = new URL(request.url);
  return Response.redirect(new URL(`/api/auth/github?next=${encodeURIComponent(u.pathname + u.search)}`, u), 302);
}

/** The project, only if the signed-in user owns it. Setup changes (GitHub, proof, phones) go through this. */
export async function ownedProject(projectId: string): Promise<{ user?: SessionUser; project?: Project }> {
  const { readDb } = await import("@antibody/core");
  const [user, db] = await Promise.all([currentUser(), readDb()]);
  const project = db.projects.find((p) => p.id === projectId);
  return { user, project: owns(user, project) ? project : undefined };
}

/** GitHub install round trip: who started it and for which project. Signed, so it can't be pointed at someone else's project. */
export type InstallState = { u: number; p?: string };
