import type { Finding, FindingKind, ScanReport, Severity } from "@antibody/core";
import { newId } from "@antibody/core";
import { findSupabase, redact, scanSecrets } from "./secrets.ts";

export interface ScanOpts {
  projectId: string;
  /** Hosts ("host:port") that may be actively probed. Everything else is passive-only. */
  verifiedDomains: string[];
  /** Injectable for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

const COMMON_TABLES = ["users", "profiles", "accounts", "customers", "orders", "messages", "notes", "payments"];
// ponytail: cap bundle fetches so a page with 100 scripts can't turn one scan into a crawl.
const MAX_BUNDLES = 12;

export async function scanUrl(targetUrl: string, opts: ScanOpts): Promise<ScanReport> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const startedAt = new Date().toISOString();
  const findings: Finding[] = [];
  const passed: string[] = [];
  const mkFinding = finder(opts.projectId, targetUrl);

  let origin: string;
  let targetHost: string;
  try {
    const u = new URL(targetUrl);
    origin = u.origin;
    targetHost = u.host;
  } catch {
    return {
      id: newId("scan"),
      projectId: opts.projectId,
      targetUrl,
      status: "error",
      startedAt,
      finishedAt: new Date().toISOString(),
      findings: [],
      passed: [],
      error: `Not a valid URL: ${targetUrl}`,
    };
  }

  const verified = opts.verifiedDomains.includes(targetHost);

  // --- Passive: fetch the page, then same-origin JS bundles. Allowed on any host. ---
  let html = "";
  let headers: Headers | undefined;
  try {
    const res = await fetchImpl(targetUrl, { method: "GET", redirect: "follow" });
    headers = res.headers;
    html = await res.text();
  } catch (err) {
    return {
      id: newId("scan"),
      projectId: opts.projectId,
      targetUrl,
      status: "error",
      startedAt,
      finishedAt: new Date().toISOString(),
      findings: [],
      passed: [],
      error: `Could not reach ${targetUrl}: ${(err as Error).message}`,
    };
  }

  // App code first: framework/vendor chunks (react-dom, next runtime, HMR) would otherwise eat the cap.
  const vendor = (src: string) => /node_modules|turbopack|polyfill|hmr-client|webpack|framework/i.test(src);
  const all = sameOriginScripts(html, origin, targetUrl);
  const bundles = [...all.filter((s) => !vendor(s)), ...all.filter(vendor)].slice(0, MAX_BUNDLES);
  const texts = [html];
  for (const src of bundles) {
    try {
      texts.push(await (await fetchImpl(src, { method: "GET" })).text());
    } catch {
      /* a bundle that won't load just isn't scanned */
    }
  }
  const blob = texts.join("\n");

  // Secrets
  const secretHits = scanSecrets(blob);
  if (secretHits.length) {
    for (const h of secretHits) {
      findings.push(
        mkFinding("secret_in_bundle", "critical", `${h.kind} exposed in your site's code`, {
          plainEnglish: `Your ${h.kind} is sitting in code that anyone visiting your site can read. Secret keys are supposed to stay on your server.`,
          impact: `Anyone can copy this key and run up charges on your account or reach data it unlocks. Found: ${h.redacted}`,
          evidence: `${h.kind}: ${h.redacted}`,
          fixHint: `Rotate this key now, then move it to a server-side environment variable instead of shipping it to the browser.`,
        }),
      );
    }
  } else {
    passed.push("secret_scan");
  }

  // Security headers
  const missing = missingHeaders(headers, origin);
  if (missing.length) {
    findings.push(
      mkFinding("missing_security_headers", "low", "Some protective HTTP headers are missing", {
        plainEnglish: `Your site isn't sending a few headers browsers use to block common attacks: ${missing.join(", ")}.`,
        impact: `Makes clickjacking and content-sniffing attacks easier. Low on its own, but worth fixing.`,
        evidence: `Missing: ${missing.join(", ")}`,
        fixHint: `Add these response headers (Next.js: in next.config headers()): ${missing.join(", ")}.`,
      }),
    );
  } else {
    passed.push("security_headers");
  }

  // Supabase discovery (passive). Raw anon key kept only in memory for the active probe.
  const supabase = findSupabase(blob);

  // --- Active: only against a verified host. ---
  if (!verified) {
    passed.push("verify domain ownership to run active checks");
  } else {
    // Active probes never follow redirects: a verified host could 3xx us onto a host that isn't verified.
    // A 3xx is then just "not 200" (not exposed / route absent).
    const probe: typeof fetch = (input, init) => fetchImpl(input, { ...init, redirect: "manual" });
    // Supabase RLS
    // The Supabase backend is its own host; probe it only if that host is verified too (hard safety rule).
    if (supabase.url && supabase.anonKey && !opts.verifiedDomains.includes(hostOf(supabase.url))) {
      passed.push(`verify ${hostOf(supabase.url)} to probe Supabase RLS`);
    } else if (supabase.url && supabase.anonKey) {
      const exposed = await supabaseRlsCheck(probe, supabase.url, supabase.anonKey);
      if (exposed.length) {
        for (const table of exposed) {
          findings.push(
            mkFinding("supabase_rls_disabled", "critical", `Anyone can read your "${table}" table`, {
              plainEnglish: `Using only your public key, anyone on the internet can download every row in your "${table}" table. Row Level Security is off.`,
              impact: `Full read access to "${table}" — names, emails, and anything else stored there — with no login.`,
              evidence: `GET ${supabase.url}/rest/v1/${table}?select=*&limit=5 returned rows using anon key ${redact(supabase.anonKey)}`,
              fixHint: `In Supabase, enable Row Level Security on "${table}" and add a policy that only lets users read their own rows.`,
              url: `${supabase.url}/rest/v1/${table}`,
            }),
          );
        }
      } else {
        passed.push("supabase_rls");
      }
    } else {
      passed.push("supabase_rls");
    }

    // Unprotected routes + IDOR
    const routeFindings = await routeChecks(probe, origin, mkFinding);
    if (routeFindings.length) findings.push(...routeFindings);
    else passed.push("unprotected_routes");

    // Rate limit on /api/chat
    const rate = await rateLimitCheck(probe, origin, mkFinding);
    if (rate) findings.push(rate);
    else passed.push("rate_limit");
  }

  return {
    id: newId("scan"),
    projectId: opts.projectId,
    targetUrl,
    status: "done",
    startedAt,
    finishedAt: new Date().toISOString(),
    findings,
    passed,
  };
}

// --- helpers ---

type MkFinding = (
  kind: FindingKind,
  severity: Severity,
  title: string,
  rest: { plainEnglish: string; impact: string; evidence: string; fixHint: string; url?: string },
) => Finding;

function finder(projectId: string, targetUrl: string): MkFinding {
  return (kind, severity, title, rest) => ({
    id: newId("find"),
    projectId,
    kind,
    severity,
    title,
    plainEnglish: rest.plainEnglish,
    impact: rest.impact,
    evidence: rest.evidence,
    location: { url: rest.url ?? targetUrl },
    fixHint: rest.fixHint,
    detectedBy: "url_scan",
    createdAt: new Date().toISOString(),
  });
}

/** <script src> values that resolve to the same origin as the page. */
export function sameOriginScripts(html: string, origin: string, base: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
    try {
      const abs = new URL(m[1], base);
      if (abs.origin === origin && !out.includes(abs.href)) out.push(abs.href);
    } catch {
      /* skip unparseable src */
    }
  }
  return out;
}

function missingHeaders(headers: Headers | undefined, origin: string): string[] {
  const has = (name: string, alt?: string) =>
    !!headers?.get(name) || (alt ? !!headers?.get(alt) : false);
  const missing: string[] = [];
  // CSP (covers X-Frame-Options via frame-ancestors, but we report both names for clarity)
  if (!has("content-security-policy")) missing.push("Content-Security-Policy");
  const csp = headers?.get("content-security-policy") ?? "";
  if (!has("x-frame-options") && !/frame-ancestors/i.test(csp)) missing.push("X-Frame-Options");
  if (!has("x-content-type-options")) missing.push("X-Content-Type-Options");
  if (origin.startsWith("https://") && !has("strict-transport-security"))
    missing.push("Strict-Transport-Security");
  return missing;
}

async function supabaseRlsCheck(fetchImpl: typeof fetch, url: string, anonKey: string): Promise<string[]> {
  const exposed: string[] = [];
  for (const table of COMMON_TABLES) {
    try {
      const res = await fetchImpl(`${url}/rest/v1/${table}?select=*&limit=5`, {
        headers: { apikey: anonKey, authorization: `Bearer ${anonKey}` },
      });
      if (!res.ok) continue;
      const body = await res.json().catch(() => null);
      if (Array.isArray(body) && body.length > 0) exposed.push(table);
    } catch {
      /* table missing or network error: not exposed */
    }
  }
  return exposed;
}

/** 200 + non-empty JSON on an unauth'd request = exposed. users/:id variants that leak data = IDOR. */
async function routeChecks(fetchImpl: typeof fetch, origin: string, mk: MkFinding): Promise<Finding[]> {
  const admin = ["/api/admin", "/api/admin/stats", "/admin", "/api/users"];
  const idor = ["/api/users/1", "/api/users/2"];
  const out: Finding[] = [];

  for (const path of admin) {
    if (await returnsJsonData(fetchImpl, origin + path)) {
      out.push(
        mk("unprotected_route", "high", `"${path}" is open to anyone`, {
          plainEnglish: `Anyone can open ${path} without logging in and get real data back.`,
          impact: `Admin or user data is reachable by any visitor — no account needed.`,
          evidence: `GET ${origin}${path} returned 200 with JSON data and no authentication.`,
          fixHint: `Require an authenticated session (and an admin check where relevant) before this route returns data.`,
          url: origin + path,
        }),
      );
    }
  }

  const leaked: string[] = [];
  for (const path of idor) if (await returnsJsonData(fetchImpl, origin + path)) leaked.push(path);
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
    const res = await fetchImpl(url, { method: "GET" });
    if (res.status !== 200) return false;
    const body = await res.json().catch(() => null);
    if (body == null) return false;
    if (Array.isArray(body)) return body.length > 0;
    return typeof body === "object" && Object.keys(body).length > 0;
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
      if ((await post()).status === 429) sawLimit = true;
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

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
