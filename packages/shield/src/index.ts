// Antibody shield: in-request blocking for Next.js 16 proxy (formerly middleware).
//
// Drop-in for a Next 16 app — create `proxy.ts` next to `app/`:
//
//   import { createShield } from "@antibody/shield";
//   export const proxy = createShield({ projectId: "demo" });
//   export const config = { matcher: ["/api/:path*", "/login"] };
//
// Returning undefined lets the request through; returning a Response short-circuits it.
// Proxy runs on the Node.js runtime in Next 16, so node:crypto and the Chalk client work.
import { createHash } from "node:crypto";
import type { ShieldDecision } from "@antibody/core";
import { observe, recordOutcome as recordCtxOutcome, resetEngine, routeOf, score, type Features, type RequestContext } from "./engine.ts";

export { LIMITS, BLOCK_AT, CHALLENGE_AT, observe, score, routeOf, type Features, type RequestContext } from "./engine.ts";

const CHALK_TIMEOUT_MS = 150;

/** Only API and auth routes by default; never static assets. */
export function isSensitive(pathname: string): boolean {
  if (pathname.startsWith("/_next/") || /\.[a-z0-9]{2,5}$/i.test(pathname)) return false;
  return pathname.startsWith("/api/") || /^\/(?:login|logout|signin|signup|auth|admin)(?:\/|$)/.test(pathname);
}

// ponytail: trusts x-forwarded-for as-is (spoofable). Fine behind one trusted proxy / for local demos.
function ipOf(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

/** Fingerprint of the session cookie or bearer token; the raw token never leaves this function. */
function sessionOf(req: Request): string | undefined {
  // A Supabase-style public anon key (sent with an `apikey` header) is shared by every visitor: not a session.
  const auth = req.headers.has("apikey") ? null : req.headers.get("authorization");
  const cookie = (req.headers.get("cookie") ?? "")
    .split(";")
    .map((c) => c.trim())
    .find((c) => /^[^=]*(?:session|sid|token|auth)[^=]*=/i.test(c));
  const raw = auth ?? cookie;
  return raw ? createHash("sha256").update(raw).digest("hex").slice(0, 12) : undefined;
}

export function contextFrom(req: Request): RequestContext {
  return { method: req.method, pathname: new URL(req.url).pathname, ip: ipOf(req), sessionId: sessionOf(req) };
}

/** Call from a route handler (e.g. /api/login) with the response status, so 401s count as failed logins. */
export function recordOutcome(req: Request | RequestContext, status: number) {
  recordCtxOutcome(req instanceof Request ? contextFrom(req) : req, status);
}

// --- Chalk path --------------------------------------------------------------------------------

type ChalkQuery = (inputs: Record<string, string | number>, outputs: string[]) => Promise<Record<string, { value: unknown }>>;
let chalk: Promise<ChalkQuery> | undefined;
let loggedMode = false;

const hasChalkCreds = () => Boolean(process.env.CHALK_CLIENT_ID && process.env.CHALK_CLIENT_SECRET);

function chalkQuery(): Promise<ChalkQuery> {
  // Imported lazily: the client pulls in gRPC, which we don't want loaded in mock mode.
  chalk ??= import("@chalk-ai/client").then(({ ChalkClient }) => {
    const client = new ChalkClient({
      clientId: process.env.CHALK_CLIENT_ID,
      clientSecret: process.env.CHALK_CLIENT_SECRET,
      activeEnvironment: process.env.CHALK_ENVIRONMENT || undefined,
      apiServer: process.env.CHALK_API_SERVER || undefined,
    });
    return async (inputs, outputs) =>
      (await client.query({ inputs, outputs }, { timeout: CHALK_TIMEOUT_MS })).data as Record<string, { value: unknown }>;
  });
  chalk.catch(() => (chalk = undefined)); // retry construction next time instead of caching the failure
  return chalk;
}

const CHALK_OUTPUTS = ["request.risk_score", "request.decision", "request.reasons"];

function chalkInputs(ctx: RequestContext, f: Features): Record<string, string | number> {
  return {
    "request.id": crypto.randomUUID(),
    "request.method": ctx.method,
    "request.path": ctx.pathname,
    "request.session_id": ctx.sessionId ?? `ip:${ctx.ip}`,
    "request.ip_id": ctx.ip,
    "request.endpoint_id": routeOf(ctx.pathname),
    // Edge-computed windows (same definitions as chalk/src/features.py).
    "request.session_distinct_users_5m": f.sessionDistinctUsers5m,
    "request.session_user_read_span_s": f.sessionUserReadSpanS,
    "request.ip_route_rpm": f.ipRouteRpm,
    "request.ip_failed_logins_10m": f.ipFailedLogins10m,
    "request.ip_login_attempts_10m": f.ipLoginAttempts10m,
    "request.session_ai_calls_1m": f.sessionAiCalls1m,
  };
}

async function askChalk(ctx: RequestContext, f: Features): Promise<ShieldDecision> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Throws on timeout, network error or a bad shape; evaluate() falls back to the local engine.
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${CHALK_TIMEOUT_MS}ms`)), CHALK_TIMEOUT_MS);
    });
    const query = await Promise.race([chalkQuery(), timeout]);
    const data = await Promise.race([query(chalkInputs(ctx, f), CHALK_OUTPUTS), timeout]);
    const action = data["request.decision"]?.value;
    const riskScore = Number(data["request.risk_score"]?.value);
    if ((action !== "allow" && action !== "block" && action !== "challenge") || !Number.isFinite(riskScore)) {
      throw new Error("unexpected response shape");
    }
    const reasons = data["request.reasons"]?.value;
    return { action, riskScore, reasons: Array.isArray(reasons) ? reasons.map(String) : [], source: "chalk" };
  } finally {
    clearTimeout(timer);
  }
}

/** After a Chalk failure, skip Chalk for this long (circuit breaker) so requests don't each wait the timeout. */
const CHALK_COOLDOWN_MS = 30_000;
let chalkDownUntil = 0;

/**
 * Record the request and decide. Uses Chalk when CHALK_CLIENT_ID/SECRET are set, else the local engine.
 * If Chalk is slow or down, the local engine decides instead (it never errors and never blocks normal browsing),
 * so a broken feature store neither takes the app down nor switches the shield off.
 */
export async function evaluate(ctx: RequestContext): Promise<ShieldDecision> {
  const f = observe(ctx);
  if (!loggedMode) {
    loggedMode = true;
    console.log(hasChalkCreds() ? "[shield] Chalk mode (150ms timeout, local engine fallback)" : "[shield] MOCK: no Chalk creds, using local feature engine");
  }
  if (!hasChalkCreds()) return score(f, ctx);
  if (Date.now() < chalkDownUntil) return withNote(score(f, ctx), "Chalk paused after a failure; local engine decided");
  try {
    return await askChalk(ctx, f);
  } catch (err) {
    const msg = (err instanceof Error ? err.message : String(err)).slice(0, 80);
    chalkDownUntil = Date.now() + CHALK_COOLDOWN_MS;
    console.warn(`[shield] Chalk unavailable (${msg}); using the local engine for ${CHALK_COOLDOWN_MS / 1000}s`);
    return withNote(score(f, ctx), `Chalk unavailable (${msg}); local engine decided`);
  }
}

const withNote = (d: ShieldDecision, note: string): ShieldDecision => ({ ...d, reasons: [...d.reasons, note] });

// --- Next.js-style handler ---------------------------------------------------------------------

const lastReport = new Map<string, number>();

function report(eventsUrl: string, body: object, key: string) {
  // ponytail: at most one activity event per actor per 10s, so a flood doesn't flood the feed too.
  const now = Date.now();
  if (now - (lastReport.get(key) ?? 0) < 10_000) return;
  lastReport.set(key, now);
  fetch(eventsUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
}

export interface ShieldOptions {
  projectId: string;
  protect?: (pathname: string) => boolean;
  eventsUrl?: string;
}

export function createShield(opts: ShieldOptions) {
  const protect = opts.protect ?? isSensitive;
  const eventsUrl = opts.eventsUrl ?? `${process.env.ANTIBODY_WEB_URL ?? "http://localhost:3000"}/api/events`;

  return async (request: Request): Promise<Response | undefined> => {
    const ctx = contextFrom(request);
    if (!protect(ctx.pathname)) return undefined;
    const d = await evaluate(ctx);
    if (d.action === "allow") return undefined;

    const status = d.action === "block" ? 403 : 429;
    report(
      eventsUrl,
      {
        projectId: opts.projectId,
        type: "block",
        title: `${d.action === "block" ? "Blocked" : "Challenged"} ${ctx.method} ${ctx.pathname}`,
        detail: `${d.reasons.join("; ")} (risk ${d.riskScore}, source ${d.source})`,
        channel: "web",
      },
      ctx.sessionId ?? ctx.ip,
    );
    return Response.json(
      { error: d.action === "block" ? "Blocked by Antibody shield" : "Slow down", reasons: d.reasons, riskScore: d.riskScore },
      { status, headers: { "x-antibody-shield": `${d.action}; source=${d.source}`, ...(status === 429 ? { "retry-after": "30" } : {}) } },
    );
  };
}

/** Test helper: forget all windows, the cached Chalk client and report throttling. */
export function resetShield() {
  resetEngine();
  chalk = undefined;
  chalkDownUntil = 0;
  lastReport.clear();
}
