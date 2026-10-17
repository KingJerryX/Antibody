import type { Finding, FindingKind, ScanReport, Severity } from "@antibody/core";
import { newId } from "@antibody/core";
import { findSupabase, redact, scanSecrets } from "./secrets.ts";
export { auditCode, auditGithubRepo, mergeFindings } from "./code-audit.ts";

export interface ScanOpts {
  projectId: string;
  /** Hosts ("host:port") that may be actively probed. Everything else is passive-only. */
  verifiedDomains: string[];
  /** Injectable for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

const COMMON_TABLES = ["users", "profiles", "accounts", "customers", "orders", "messages", "notes", "payments"];
const ADMIN_PATHS = ["/api/admin", "/api/admin/stats", "/admin", "/api/users"];
const IDOR_PATHS = ["/api/users/1", "/api/users/2"];
// ponytail: cap bundle fetches so a page with 100 scripts can't turn one scan into a crawl.
const MAX_BUNDLES = 12;
/** Per request, so one hung endpoint can't hang the whole scan. */
const REQUEST_TIMEOUT_MS = 10_000;
const VENDOR = /node_modules|turbopack|polyfill|hmr-client|webpack|framework/i;
const SCRIPT_SRC = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;

export async function scanUrl(targetUrl: string, opts: ScanOpts): Promise<ScanReport> {
  const base = opts.fetchImpl ?? fetch;
  const fetchImpl: typeof fetch = (input, init) => base(input, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), ...init });
  const startedAt = new Date().toISOString();
  const report = (rest: Pick<ScanReport, "status" | "findings" | "passed" | "error">): ScanReport => ({
    id: newId("scan"),
    projectId: opts.projectId,
    targetUrl,
    startedAt,
    finishedAt: new Date().toISOString(),
    ...rest,
  });
  const fail = (error: string) => report({ status: "error", findings: [], passed: [], error });
  const findings: Finding[] = [];
  const passed: string[] = [];
  const mk = finder(opts.projectId, targetUrl);

  const target = URL.parse(targetUrl);
  if (!target) return fail(`Not a valid URL: ${targetUrl}`);
  const { origin } = target;

  // --- Passive: fetch the page, then same-origin JS bundles. Allowed on any host. ---
  let html: string;
  let headers: Headers;
  try {
    const res = await fetchImpl(targetUrl);
    headers = res.headers;
    html = await res.text();
  } catch (err) {
    return fail(`Could not reach ${targetUrl}: ${(err as Error).message}`);
  }

  // App code first: framework/vendor chunks (react-dom, next runtime, HMR) would otherwise eat the cap.
  const all = sameOriginScripts(html, origin, targetUrl);
  const bundles = [...all.filter((s) => !VENDOR.test(s)), ...all.filter((s) => VENDOR.test(s))].slice(0, MAX_BUNDLES);
  // A bundle that won't load just isn't scanned.
  const texts = await Promise.all(bundles.map((src) => fetchImpl(src).then((r) => r.text()).catch(() => "")));
  const blob = [html, ...texts].join("\n");

  // Secrets
  const secretHits = scanSecrets(blob);
  for (const h of secretHits) {
    findings.push(
      mk("secret_in_bundle", "critical", `${h.kind} exposed in your site's code`, {
        plainEnglish: `Your ${h.kind} is sitting in code that anyone visiting your site can read. Secret keys are supposed to stay on your server.`,
        impact: `Anyone can copy this key and run up charges on your account or reach data it unlocks. Found: ${h.redacted}`,
        evidence: `${h.kind}: ${h.redacted}`,
        fixHint: `Rotate this key now, then move it to a server-side environment variable instead of shipping it to the browser.`,
      }),
    );
  }
  if (!secretHits.length) passed.push("secret_scan");

  // Security headers
  const missing = missingHeaders(headers, origin);
  if (missing.length) {
    findings.push(
      mk("missing_security_headers", "low", "Some protective HTTP headers are missing", {
        plainEnglish: `Your site isn't sending a few headers browsers use to block common attacks: ${missing.join(", ")}.`,
        impact: `Makes clickjacking and content-sniffing attacks easier. Low on its own, but worth fixing.`,
        evidence: `Missing: ${missing.join(", ")}`,
        fixHint: `Add these response headers (Next.js: in next.config headers()): ${missing.join(", ")}.`,
      }),
    );
  } else {
    passed.push("security_headers");
  }

  // --- Active: only against a verified host. ---
  if (!opts.verifiedDomains.includes(target.host)) {
    passed.push("verify domain ownership to run active checks");
    return report({ status: "done", findings, passed });
  }
  // Active probes never follow redirects: a verified host could 3xx us onto a host that isn't verified.
  // A 3xx is then just "not 200" (not exposed / route absent).
  const probe: typeof fetch = (input, init) => fetchImpl(input, { ...init, redirect: "manual" });

  // Supabase RLS. Discovery is passive; the raw anon key stays in memory for this probe only.
  // The Supabase backend is its own host; probe it only if that host is verified too (hard safety rule).
  const { url, anonKey } = findSupabase(blob);
  if (!url || !anonKey) {
    passed.push("supabase_rls");
  } else if (!opts.verifiedDomains.includes(hostOf(url))) {
    passed.push(`verify ${hostOf(url)} to probe Supabase RLS`);
  } else {
    const exposed = await supabaseRlsCheck(probe, url, anonKey);
    for (const table of exposed) {
      findings.push(
        mk("supabase_rls_disabled", "critical", `Anyone can read your "${table}" table`, {
          plainEnglish: `Using only your public key, anyone on the internet can download every row in your "${table}" table. Row Level Security is off.`,
          impact: `Full read access to "${table}" — names, emails, and anything else stored there — with no login.`,
          evidence: `GET ${url}/rest/v1/${table}?select=*&limit=5 returned rows using anon key ${redact(anonKey)}`,
          fixHint: `In Supabase, enable Row Level Security on "${table}" and add a policy that only lets users read their own rows.`,
          url: `${url}/rest/v1/${table}`,
        }),
      );
    }
    if (!exposed.length) passed.push("supabase_rls");
  }

  // Unprotected routes + IDOR
  const routeFindings = await routeChecks(probe, origin, mk);
  findings.push(...routeFindings);
  if (!routeFindings.length) passed.push("unprotected_routes");

  // Rate limit on /api/chat
  const rate = await rateLimitCheck(probe, origin, mk);
  if (rate) findings.push(rate);
  else passed.push("rate_limit");

  return report({ status: "done", findings, passed });
}

// --- helpers ---

type MkFinding = (
  kind: FindingKind,
  severity: Severity,
  title: string,
  rest: { plainEnglish: string; impact: string; evidence: string; fixHint: string; url?: string },
) => Finding;

function finder(projectId: string, targetUrl: string): MkFinding {
  return (kind, severity, title, { url, ...text }) => ({
    id: newId("find"),
    projectId,
    kind,
    severity,
    title,
    ...text,
    location: { url: url ?? targetUrl },
    detectedBy: "url_scan",
    createdAt: new Date().toISOString(),
  });
}

/** <script src> values that resolve to the same origin as the page. */
function sameOriginScripts(html: string, origin: string, base: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(SCRIPT_SRC)) {
    const abs = URL.parse(m[1], base);
    if (abs?.origin === origin) out.add(abs.href);
  }
  return [...out];
}

function missingHeaders(headers: Headers, origin: string): string[] {
  const missing: string[] = [];
  const csp = headers.get("content-security-policy");
  if (!csp) missing.push("Content-Security-Policy");
  // CSP frame-ancestors covers X-Frame-Options.
  if (!headers.get("x-frame-options") && !/frame-ancestors/i.test(csp ?? "")) missing.push("X-Frame-Options");
  if (!headers.get("x-content-type-options")) missing.push("X-Content-Type-Options");
  if (origin.startsWith("https://") && !headers.get("strict-transport-security")) missing.push("Strict-Transport-Security");
  return missing;
}

/** Each path in `paths` for which `check` resolves true, in order, checked in parallel. */
async function matching(paths: string[], check: (p: string) => Promise<boolean>): Promise<string[]> {
  const hits = await Promise.all(paths.map(check));
  return paths.filter((_, i) => hits[i]);
}

function supabaseRlsCheck(fetchImpl: typeof fetch, url: string, anonKey: string): Promise<string[]> {
  return matching(COMMON_TABLES, async (table) => {
    try {
      const res = await fetchImpl(`${url}/rest/v1/${table}?select=*&limit=5`, {
        headers: { apikey: anonKey, authorization: `Bearer ${anonKey}` },
      });
      const body = res.ok ? await res.json().catch(() => null) : null;
      return Array.isArray(body) && body.length > 0;
    } catch {
      return false; // table missing or network error: not exposed
    }
  });
}

/** 200 + non-empty JSON on an unauth'd request = exposed. users/:id variants that leak data = IDOR. */
async function routeChecks(fetchImpl: typeof fetch, origin: string, mk: MkFinding): Promise<Finding[]> {
  const open = (path: string) => returnsJsonData(fetchImpl, origin + path);
  const [admin, leaked] = await Promise.all([matching(ADMIN_PATHS, open), matching(IDOR_PATHS, open)]);

  const out = admin.map((path) =>
    mk("unprotected_route", "high", `"${path}" is open to anyone`, {
      plainEnglish: `Anyone can open ${path} without logging in and get real data back.`,
      impact: `Admin or user data is reachable by any visitor — no account needed.`,
      evidence: `GET ${origin}${path} returned 200 with JSON data and no authentication.`,
      fixHint: `Require an authenticated session (and an admin check where relevant) before this route returns data.`,
      url: origin + path,
    }),
  );
  if (leaked.length) {
    out.push(
      mk("idor", "high", "User records are readable by guessing IDs", {
        plainEnglish: `Changing the number in the URL (${leaked.join(", ")}) returns other people's records without any login.`,
        impact: `An attacker can walk the IDs and scrape every user's data.`,
        evidence: `GET ${leaked.map((p) => origin + p).join(", ")} each returned another user's data unauthenticated.`,
        fixHint: `Check the logged-in user owns the record (or is an admin) before returning it; don't key access off the URL alone.`,
        url: origin + leaked[0],
      }),
    );
  }
  return out;
}

async function returnsJsonData(fetchImpl: typeof fetch, url: string): Promise<boolean> {
  try {
    const res = await fetchImpl(url);
    const body: unknown = res.status === 200 ? await res.json().catch(() => null) : null;
    // Non-empty object or array (an array's keys are its indexes).
    return typeof body === "object" && body !== null && Object.keys(body).length > 0;
  } catch {
    return false;
  }
}

/** Probe /api/chat; if it exists, fire 25 quick POSTs and see whether any get rate-limited (429). */
async function rateLimitCheck(fetchImpl: typeof fetch, origin: string, mk: MkFinding): Promise<Finding | undefined> {
  const url = origin + "/api/chat";
  const post = () =>
    fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hi" }),
    });

  let first: Response;
  try {
    first = await post();
  } catch {
    return undefined; // route not reachable
  }
  // 404 = doesn't exist; 3xx = redirected away (not followed), so there's no endpoint here to hammer.
  if (first.status === 404 || (first.status >= 300 && first.status < 400)) return undefined;

  let sawLimit = first.status === 429;
  for (let i = 1; i < 25 && !sawLimit; i++) {
    try {
      sawLimit = (await post()).status === 429;
    } catch {
      break;
    }
  }
  if (sawLimit) return undefined;

  // /api/chat is AI-backed -> treat an unthrottled endpoint as high (cost + abuse risk).
  return mk("missing_rate_limit", "high", '"/api/chat" has no rate limit', {
    plainEnglish: `We sent 25 messages to /api/chat in a row and none were blocked. There's nothing stopping someone from hammering it.`,
    impact: `An attacker can run up your AI bill and overload the endpoint by sending thousands of requests.`,
    evidence: `25 consecutive POSTs to ${url} with no 429 (rate-limit) response.`,
    fixHint: `Add per-IP or per-user rate limiting in front of this route (e.g. a token bucket or a limiter like @upstash/ratelimit).`,
    url,
  });
}

const hostOf = (url: string) => URL.parse(url)?.host ?? url;
