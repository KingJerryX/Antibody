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

// Thresholds: the value at which a signal alone scores 1.0 (= block). Keep in sync with chalk/src/features.py.
const LIMITS = {
  extraUsersRead: 5, // own profile + 5 others in 5 min
  routeRpm: 30,
  failedLogins: 5,
  loginAttempts: 10,
  aiCallsPerMin: 10,
} as const;
const BLOCK_AT = 0.9;
const CHALLENGE_AT = 0.7;

const MIN = 60_000;
/** Longest window below; anything older is dead weight. */
const HORIZON = 10 * MIN;
const USER_READ = /^\/api\/(?:users|profiles|accounts)\/([^/?#]+)/;
const LOGIN = /\/(?:api\/)?(?:login|signin|auth\/login|auth\/token)\/?$/;
const AI = /^\/api\/chat(?:\/|$)/;
const ID_SEGMENT = /\/(?:\d+|[0-9a-f-]{16,}|[0-9a-z]{20,})(?=\/|$)/gi;

const isLoginPath = (p: string) => LOGIN.test(p);

/** "/api/users/42/orders" -> "/api/users/:id/orders" so one route = one rate bucket. */
export const routeOf = (pathname: string) => pathname.replace(ID_SEGMENT, "/:id");

type Entry = { at: number; v: string };

// ponytail: per-process memory (use Chalk/Redis across instances). Assumes each key's timestamps arrive
// in order, which holds for Date.now() and for the increasing clocks tests and evals pass.
// globalThis so a Next proxy bundle and route-handler bundles in one process share the same windows.
const g = globalThis as { __antibodyShieldWindows?: Map<string, Entry[]> };
const windows = (g.__antibodyShieldWindows ??= new Map<string, Entry[]>());
let lastSweep = 0;

export function resetEngine() {
  windows.clear();
  lastSweep = 0;
}

function add(key: string, at: number, v = "") {
  const list = windows.get(key);
  if (list) list.push({ at, v });
  else windows.set(key, [{ at, v }]);
}

/** Entries in the last `windowMs`. Older ones are dropped for good: each key is only ever read with one window. */
function recent(key: string, windowMs: number, now: number): Entry[] {
  const list = windows.get(key);
  if (!list) return [];
  const keep = list.findIndex((e) => e.at > now - windowMs);
  if (keep === -1) {
    windows.delete(key);
    return [];
  }
  if (keep > 0) list.splice(0, keep);
  return list;
}

/** Once a minute, forget actors silent for longer than every window, so rotating IPs/cookies can't grow memory forever. */
function sweep(now: number) {
  if (now - lastSweep < MIN) return;
  lastSweep = now;
  for (const [key, list] of windows) if (list[list.length - 1].at <= now - HORIZON) windows.delete(key);
}

const actorOf = (ctx: RequestContext) => (ctx.sessionId ? `s:${ctx.sessionId}` : `ip:${ctx.ip}`);

/** Record this request in the windows, then return the features as of this request. */
export function observe(ctx: RequestContext): Features {
  const now = ctx.at ?? Date.now();
  const actor = actorOf(ctx);
  const rpmKey = `rpm:${ctx.ip}:${routeOf(ctx.pathname)}`;
  sweep(now);

  const userId = USER_READ.exec(ctx.pathname)?.[1];
  if (userId) add(`users:${actor}`, now, userId);
  add(rpmKey, now);
  if (isLoginPath(ctx.pathname) && ctx.method !== "GET") add(`login:${ctx.ip}`, now);
  if (AI.test(ctx.pathname)) add(`ai:${actor}`, now);

  const reads = recent(`users:${actor}`, 5 * MIN, now);
  return {
    sessionDistinctUsers5m: new Set(reads.map((e) => e.v)).size,
    sessionUserReadSpanS: reads.length ? Math.round((now - reads[0].at) / 1000) : 0,
    ipRouteRpm: recent(rpmKey, MIN, now).length,
    ipFailedLogins10m: recent(`fail:${ctx.ip}`, 10 * MIN, now).length,
    ipLoginAttempts10m: recent(`login:${ctx.ip}`, 10 * MIN, now).length,
    sessionAiCalls1m: recent(`ai:${actor}`, MIN, now).length,
  };
}

/** Tell the engine how a request ended, so 401s on login count as failed logins. */
export function recordOutcome(ctx: Pick<RequestContext, "pathname" | "ip" | "at">, status: number) {
  if (status === 401 && isLoginPath(ctx.pathname)) add(`fail:${ctx.ip}`, ctx.at ?? Date.now());
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
