// Local feature engine: in-memory sliding windows + scoring.
// Mirrors chalk/src/ (same feature names and thresholds) so the Chalk path and local path agree.
import type { ShieldDecision } from "@antibody/core";

export interface RequestContext {
  method: string;
  pathname: string;
  ip: string;
  /** Session cookie / bearer token fingerprint, when the request has one. */
  sessionId?: string;
  /** ms since epoch; defaults to Date.now(). Tests and evals pass their own clock. */
  at?: number;
}

export interface Features {
  /** Distinct user ids this actor read from /api/users/:id-style routes in 5 min. */
  sessionDistinctUsers5m: number;
  /** Seconds between the first and latest of those reads. */
  sessionUserReadSpanS: number;
  /** Requests from this IP to this route in the last minute. */
  ipRouteRpm: number;
  /** 401s on login routes from this IP in 10 min (via recordOutcome). */
  ipFailedLogins10m: number;
  /** Login attempts from this IP in 10 min (path heuristic, used when outcomes aren't recorded). */
  ipLoginAttempts10m: number;
  /** /api/chat calls by this actor in the last minute. */
  sessionAiCalls1m: number;
}

// Thresholds: the value at which a signal alone scores 1.0 (= block).
export const LIMITS = {
  extraUsersRead: 5, // own profile + 5 others in 5 min
  routeRpm: 30,
  failedLogins: 5,
  loginAttempts: 10,
  aiCallsPerMin: 10,
} as const;
export const BLOCK_AT = 0.9;
export const CHALLENGE_AT = 0.7;

const MIN = 60_000;
const USER_READ = /^\/api\/(?:users|profiles|accounts)\/([^/?#]+)/;
const LOGIN = /\/(?:api\/)?(?:login|signin|auth\/login|auth\/token)\/?$/;
const AI = /^\/api\/chat(?:\/|$)/;

export const isLoginPath = (p: string) => LOGIN.test(p);

/** "/api/users/42/orders" -> "/api/users/:id/orders" so one route = one rate bucket. */
export function routeOf(pathname: string): string {
  return pathname.replace(/\/(?:\d+|[0-9a-f-]{16,}|[0-9a-z]{20,})(?=\/|$)/gi, "/:id");
}

type Entry = { at: number; v: string };

// ponytail: per-process memory; keys are never globally swept (only pruned on touch),
// so an attacker rotating spoofed IPs grows the maps. Fine for a demo; use Chalk/Redis in prod.
class Windows {
  private m = new Map<string, Entry[]>();
  add(key: string, at: number, v = "") {
    const list = this.m.get(key) ?? [];
    list.push({ at, v });
    this.m.set(key, list);
  }
  recent(key: string, windowMs: number, now: number): Entry[] {
    const list = (this.m.get(key) ?? []).filter((e) => e.at > now - 10 * MIN);
    if (list.length) this.m.set(key, list);
    else this.m.delete(key);
    return list.filter((e) => e.at > now - windowMs && e.at <= now);
  }
  clear() {
    this.m.clear();
  }
}

// globalThis so a Next proxy bundle and route-handler bundles in one process share the same windows.
const g = globalThis as { __antibodyWindows?: Windows };
const w = (g.__antibodyWindows ??= new Windows());

export function resetEngine() {
  w.clear();
}

const actorOf = (ctx: RequestContext) => (ctx.sessionId ? `s:${ctx.sessionId}` : `ip:${ctx.ip}`);

/** Record this request in the windows, then return the features as of this request. */
export function observe(ctx: RequestContext): Features {
  const now = ctx.at ?? Date.now();
  const actor = actorOf(ctx);
  const route = routeOf(ctx.pathname);

  const userId = USER_READ.exec(ctx.pathname)?.[1];
  if (userId) w.add(`users:${actor}`, now, userId);
  w.add(`rpm:${ctx.ip}:${route}`, now);
  if (isLoginPath(ctx.pathname) && ctx.method !== "GET") w.add(`login:${ctx.ip}`, now);
  if (AI.test(ctx.pathname)) w.add(`ai:${actor}`, now);

  const reads = w.recent(`users:${actor}`, 5 * MIN, now);
  return {
    sessionDistinctUsers5m: new Set(reads.map((e) => e.v)).size,
    sessionUserReadSpanS: reads.length ? Math.round((now - reads[0].at) / 1000) : 0,
    ipRouteRpm: w.recent(`rpm:${ctx.ip}:${route}`, MIN, now).length,
    ipFailedLogins10m: w.recent(`fail:${ctx.ip}`, 10 * MIN, now).length,
    ipLoginAttempts10m: w.recent(`login:${ctx.ip}`, 10 * MIN, now).length,
    sessionAiCalls1m: w.recent(`ai:${actor}`, MIN, now).length,
  };
}

/** Tell the engine how a request ended, so 401s on login count as failed logins. */
export function recordOutcome(ctx: Pick<RequestContext, "pathname" | "ip" | "at">, status: number) {
  if (status === 401 && isLoginPath(ctx.pathname)) w.add(`fail:${ctx.ip}`, ctx.at ?? Date.now());
}

const clamp = (x: number) => Math.max(0, Math.min(1, x));

/** Pure scoring: features -> decision with plain-English reasons. */
export function score(f: Features, ctx: Pick<RequestContext, "pathname" | "sessionId">): ShieldDecision {
  const who = ctx.sessionId ? "this session" : "this IP";
  const signals: [number, string][] = [
    [
      clamp((f.sessionDistinctUsers5m - 1) / LIMITS.extraUsersRead),
      `${who} read ${f.sessionDistinctUsers5m} different users' profiles in ${f.sessionUserReadSpanS}s; normal is 1`,
    ],
    [
      clamp(f.ipRouteRpm / LIMITS.routeRpm),
      `this IP sent ${f.ipRouteRpm} requests to ${routeOf(ctx.pathname)} in the last minute; normal is under 20`,
    ],
    [
      clamp(Math.max(f.ipFailedLogins10m / LIMITS.failedLogins, f.ipLoginAttempts10m / LIMITS.loginAttempts)),
      `this IP had ${f.ipFailedLogins10m} failed logins (${f.ipLoginAttempts10m} attempts) in 10 min; normal is 0-1`,
    ],
    [
      clamp(f.sessionAiCalls1m / LIMITS.aiCallsPerMin),
      `${who} made ${f.sessionAiCalls1m} AI chat calls in the last minute; normal is 2-3`,
    ],
  ];
  const strong = signals.filter(([s]) => s >= 0.5).sort((a, b) => b[0] - a[0]);
  const top = Math.max(...signals.map(([s]) => s));
  // Several medium signals together are worse than one: +0.1 per extra strong signal.
  const riskScore = Math.round(clamp(top + 0.1 * Math.max(0, strong.length - 1)) * 100) / 100;
  const action = riskScore >= BLOCK_AT ? "block" : riskScore >= CHALLENGE_AT ? "challenge" : "allow";
  return { action, riskScore, reasons: strong.map(([, r]) => r), source: "local" };
}
