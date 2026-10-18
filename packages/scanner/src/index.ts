import type { Finding, FindingKind, ScanReport, Severity } from "@antibody/core";
import { newId } from "@antibody/core";
import { dnsApplies, inspectDns } from "./dns.ts";
import { findSupabase, redact, scanSecrets } from "./secrets.ts";
import { inspectSurface, probeOwned, unverifiedPage } from "./surface.ts";
export { auditCode, auditGithubRepo, auditRepo, mergeFindings } from "./code-audit.ts";
export { liveChecksRan, scanChecks } from "./checks.ts";
export type { ReviewResult } from "./repo-review.ts";

export interface ScanOpts {
  projectId: string;
  /** Hosts ("host:port") that may be actively probed. Everything else is passive-only. */
  verifiedDomains: string[];
  /** The signed-in owner proved this site is theirs (Connect Vercel: a verified domain on their Vercel project). */
  owned?: boolean;
  /** Injectable for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

const COMMON_TABLES = ["users", "profiles", "accounts", "customers", "orders", "messages", "notes", "payments", "guests"];
const ADMIN_PATHS = ["/api/admin", "/api/admin/stats", "/admin", "/api/users"];
const IDOR_PATHS = ["/api/users/1", "/api/users/2", "/api/guests/1", "/api/guests/2"];
// ponytail: cap bundle fetches so a page with 100 scripts can't turn one scan into a crawl.
const MAX_BUNDLES = 12;
const MAX_MAPS = 4;
const MAX_MAP_CHARS = 500_000;
const MAX_DISCOVERED = 20;
/** Per request, so one hung endpoint can't hang the whole scan. */
const REQUEST_TIMEOUT_MS = 10_000;
const VENDOR = /node_modules|turbopack|polyfill|hmr-client|webpack|framework/i;
const SCRIPT_SRC = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;

export async function scanUrl(targetUrl: string, opts: ScanOpts): Promise<ScanReport> {
  const base = opts.fetchImpl ?? fetch;
  const fetchImpl: typeof fetch = (input, init) => base(input, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), ...init });
  const startedAt = new Date().toISOString();
  const report = (rest: Pick<ScanReport, "status" | "findings" | "passed" | "error"> & { skipped?: string[] }): ScanReport => ({
    id: newId("scan"),
    projectId: opts.projectId,
    targetUrl,
    startedAt,
    finishedAt: new Date().toISOString(),
    skipped: [],
    ...rest,
  });
  const fail = (error: string) => report({ status: "error", findings: [], passed: [], error });
  const findings: Finding[] = [];
  const passed: string[] = [];
  const skipped: string[] = [];
  const mk = finder(opts.projectId, targetUrl);

  const target = URL.parse(targetUrl);
  if (!target) return fail(`Not a valid URL: ${targetUrl}`);
  const { origin } = target;
  // DNS checks talk to a public resolver, not the site, so they run alongside the page fetch.
  const dnsTask = dnsApplies(target.hostname) ? inspectDns(target.hostname, fetchImpl) : null;

  // --- Passive: fetch the page, then same-origin JS bundles. Allowed on any host. ---
  let html = "";
  let headers = new Headers();
  let unverified: string | undefined;
  let discovered: string[] = [];
  let blob = "";
  try {
    const res = await fetchImpl(targetUrl);
    headers = res.headers;
    html = await res.text();
    unverified = unverifiedPage(res.status, html, res.url || targetUrl);
  } catch (err) {
    void dnsTask?.catch(() => undefined);
    return fail(`Could not reach ${targetUrl}: ${(err as Error).message}`);
  }

  // A block, challenge, or error page is not evidence about the app. Leave its headers and scripts unscored.
  if (unverified) {
    skipped.push(unverified);
  } else {
    // App code first: framework/vendor chunks (react-dom, next runtime, HMR) would otherwise eat the cap.
    const all = sameOriginScripts(html, origin, targetUrl);
    const bundles = [...all.filter((s) => !VENDOR.test(s)), ...all.filter((s) => VENDOR.test(s))].slice(0, MAX_BUNDLES);
    // A bundle that won't load just isn't scanned.
    const texts = await Promise.all(bundles.map((src) => fetchImpl(src).then((r) => r.text()).catch(() => "")));
    // A source map linked from a bundle is already public. Same origin only; its sourcesContent is the app's own code.
    const mapped = await sourceMaps(fetchImpl, bundles, texts, origin);
    const maps = mapped.flatMap((m) => m.texts);
    blob = [html, ...texts, ...maps].join("\n");
    discovered = discoverApiPaths(blob);

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

    // Headers, cookies, and the app's own scripts. No extra requests.
    const exposedMaps = mapped.filter((m) => m.texts.length > 0 && !VENDOR.test(m.scriptUrl)).map((m) => m.url);
    const appCode = texts.filter((_, i) => !VENDOR.test(bundles[i] ?? ""));
    const surface = inspectSurface({ html, headers, origin, host: target.host, appCode, sourceMapUrls: exposedMaps });
    for (const issue of surface.issues) findings.push(mk(issue.kind, issue.severity, issue.title, issue));
    passed.push(...surface.passed);
  }

  if (dnsTask) {
    const dns = await dnsTask;
    for (const issue of dns.issues) findings.push(mk(issue.kind, issue.severity, issue.title, issue));
    passed.push(...dns.passed);
    skipped.push(...dns.skipped);
  }

  // --- Active: a host on the allowlist, or a site its signed-in owner proved through Connect Vercel. ---
  const allow = new Set(opts.verifiedDomains.map((d) => d.toLowerCase()));
  const owned = allow.has(target.host.toLowerCase()) || opts.owned === true;
  if (unverified || !owned) {
    skipped.push(
      unverified
        ? "Live checks did not run. The homepage was a block, challenge, or error page, so they were not scored."
        : "Live checks did not run. They call this site's API with no login, so they wait until you connect the Vercel project that hosts it.",
    );
    return report({ status: "done", findings, passed, skipped });
  }
  // Active probes never follow redirects: a verified host could 3xx us onto a host that isn't verified.
  // A 3xx is then just "not 200" (not exposed / route absent).
  const probe: typeof fetch = (input, init) => fetchImpl(input, { ...init, redirect: "manual" });

  // Supabase RLS. Discovery is passive; the raw anon key stays in memory for this probe only.
  // The Supabase backend is its own host: probe it if that host is allowlisted, or if the owner proved this site,
  // since the project named in an owned site's own code is that owner's backend.
  const { url, anonKey } = findSupabase(blob);
  if (!url || !anonKey) {
    passed.push("supabase_rls");
  } else if (!allow.has(hostOf(url).toLowerCase()) && opts.owned !== true) {
    skipped.push(`Supabase at ${hostOf(url)} was not probed. That host has to be verified before row-level security is tested.`);
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
  const routeFindings = await routeChecks(probe, origin, mk, discovered);
  findings.push(...routeFindings);
  if (!routeFindings.length) passed.push("unprotected_routes");

  // Rate limit on the routes people abuse: chat spend, password guessing, signup floods.
  const rates = await rateLimitCheck(probe, origin, mk);
  findings.push(...rates);
  if (!rates.length) passed.push("rate_limit");

  const ownedProbe = await probeOwned(probe, origin);
  for (const issue of ownedProbe.issues) findings.push(mk(issue.kind, issue.severity, issue.title, issue));
  passed.push(...ownedProbe.passed);

  return report({ status: "done", findings, passed, skipped });
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
async function routeChecks(fetchImpl: typeof fetch, origin: string, mk: MkFinding, discovered: string[]): Promise<Finding[]> {
  const open = (path: string) => returnsJsonData(fetchImpl, origin + path);
  // Paths named in the page's own scripts, plus the small fixed list. IDOR stays on the fixed id paths.
  const openPaths = [...new Set([...ADMIN_PATHS, ...discovered.filter((p) => !IDOR_PATHS.includes(p))])];
  const [admin, leaked] = await Promise.all([matching(openPaths, open), matching(IDOR_PATHS, open)]);

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

const RATE_ROUTES: { path: string; severity: Severity; noun: string; impact: string; fixHint: string }[] = [
  {
    path: "/api/chat",
    severity: "high",
    noun: "messages",
    impact: "An attacker can run up your AI bill and overload the endpoint by sending thousands of requests.",
    fixHint: "Add per-IP or per-user rate limiting in front of this route (e.g. a token bucket or a limiter like @upstash/ratelimit).",
  },
  {
    path: "/api/login",
    severity: "high",
    noun: "login attempts",
    impact: "Someone can guess passwords as fast as the server answers.",
    fixHint: "Rate-limit login by IP and by account, and slow down or lock out after repeated failures.",
  },
  {
    path: "/api/signup",
    severity: "medium",
    noun: "signups",
    impact: "Someone can create thousands of accounts or flood the signup path.",
    fixHint: "Rate-limit signup by IP.",
  },
];

/** For each known route that exists, fire 25 quick POSTs and see whether any get rate-limited (429). */
async function rateLimitCheck(fetchImpl: typeof fetch, origin: string, mk: MkFinding): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const route of RATE_ROUTES) {
    const url = origin + route.path;
    const post = () =>
      fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(route.path === "/api/chat" ? { message: "hi" } : { email: "scan@antibody.invalid", password: "not-a-password" }),
      });

    let first: Response;
    try {
      first = await post();
    } catch {
      continue; // route not reachable
    }
    // 404 = doesn't exist; 3xx = redirected away (not followed), so there's no endpoint here to hammer.
    if (first.status === 404 || (first.status >= 300 && first.status < 400)) continue;

    let sawLimit = first.status === 429;
    for (let i = 1; i < 25 && !sawLimit; i++) {
      try {
        sawLimit = (await post()).status === 429;
      } catch {
        break;
      }
    }
    if (sawLimit) continue;

    out.push(
      mk("missing_rate_limit", route.severity, `"${route.path}" has no rate limit`, {
        plainEnglish: `We sent 25 ${route.noun} to ${route.path} in a row and none were blocked. There's nothing stopping someone from hammering it.`,
        impact: route.impact,
        evidence: `25 consecutive POSTs to ${url} with no 429 (rate-limit) response.`,
        fixHint: route.fixHint,
        url,
      }),
    );
  }
  return out;
}

const hostOf = (url: string) => URL.parse(url)?.host ?? url;

const API_PATH = /["'`]((?:\\\/|\/)api(?:\\\/|\/)[^"'`\\\s]{0,160})["'`]/g;

/** `/api/...` paths named in the page or its scripts. Capped so one bundle can't turn into a crawl. */
function discoverApiPaths(blob: string): string[] {
  const out = new Set<string>();
  for (const m of blob.matchAll(API_PATH)) {
    const path = m[1].replace(/\\\//g, "/").split("?")[0].replace(/\/+$/, "");
    if (!path.startsWith("/api/") || path.includes("..") || path.includes("*")) continue;
    if (!/^\/api\/[A-Za-z0-9_./[\]$-]+$/.test(path)) continue;
    out.add(path);
    if (out.size >= MAX_DISCOVERED) break;
  }
  return [...out];
}

function mapUrl(js: string, scriptUrl: string, origin: string): string | undefined {
  const m = js.match(/[@#]\s*sourceMappingURL=(\S+)/);
  if (!m || m[1].startsWith("data:")) return;
  const abs = URL.parse(m[1], scriptUrl);
  if (abs?.origin !== origin) return;
  return abs.href;
}

/** Same-origin maps only. `sourcesContent` is inlined original source, which is where keys hide. */
async function sourceMaps(
  fetchImpl: typeof fetch,
  scripts: string[],
  bodies: string[],
  origin: string,
): Promise<{ url: string; scriptUrl: string; texts: string[] }[]> {
  const urls: { url: string; scriptUrl: string }[] = [];
  for (let i = 0; i < scripts.length && urls.length < MAX_MAPS; i++) {
    const u = mapUrl(bodies[i] ?? "", scripts[i], origin);
    if (u && !urls.some((x) => x.url === u)) urls.push({ url: u, scriptUrl: scripts[i] });
  }
  const texts = await Promise.all(
    urls.map((u) =>
      fetchImpl(u.url)
        .then((r) => (r.ok ? r.text() : ""))
        .then((t) => t.slice(0, MAX_MAP_CHARS))
        .catch(() => ""),
    ),
  );
  return urls.map((u, i) => ({ ...u, texts: expandMap(texts[i] ?? "") }));
}

function expandMap(text: string): string[] {
  if (!text) return [];
  try {
    const json = JSON.parse(text) as { sourcesContent?: unknown };
    const sources = Array.isArray(json.sourcesContent) ? json.sourcesContent.filter((s): s is string => typeof s === "string") : [];
    return [text, ...sources.map((s) => s.slice(0, MAX_MAP_CHARS))];
  } catch {
    return [text];
  }
}
