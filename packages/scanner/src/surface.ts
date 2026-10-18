// Passive review of a page we already downloaded, plus a few owned-host probes.
// Nothing in inspectSurface makes a request. probeOwned is only called after the
// scanner has confirmed the host is verified or the page proves the caller can edit it.
import type { FindingKind, Severity } from "@antibody/core";

export interface SurfaceIssue {
  kind: FindingKind;
  severity: Severity;
  title: string;
  plainEnglish: string;
  impact: string;
  evidence: string;
  fixHint: string;
  url?: string;
}

export interface SurfaceResult {
  issues: SurfaceIssue[];
  passed: string[];
}

/**
 * The response is a block, challenge, redirect, or error, so its headers and scripts are not the site.
 * Callers record the returned sentence on `skipped` and leave page checks unrun.
 */
export function unverifiedPage(status: number, html: string, finalUrl: string): string | undefined {
  if (status < 200 || status >= 300 || !html.trim() || challengePage(html, finalUrl)) {
    return "Page review did not run. The response was a block, challenge, or error page, so header and script findings were not scored.";
  }
}

const SESSION_COOKIE = /session|sid|token|auth|jwt|^sess/i;
const CSRF_COOKIE = /csrf|xsrf/i;
const SENSITIVE_KEY = /token|jwt|auth|password|secret|session|api[-_]?key|credential|refresh/i;

export function inspectSurface(input: {
  html: string;
  headers: Headers;
  origin: string;
  host: string;
  /** Same-origin bundles that are not framework or vendor chunks. */
  appCode: string[];
  sourceMapUrls: string[];
}): SurfaceResult {
  const https = input.origin.startsWith("https://");
  const local = isLocal(input.host);
  const issues: SurfaceIssue[] = [];
  const cookies = setCookies(input.headers).map(parseCookie).filter((c) => c.name);
  const session = cookies.filter((c) => SESSION_COOKIE.test(c.name) && !CSRF_COOKIE.test(c.name));
  const credentials = session.length > 0 || passwordField(input.html);

  issues.push(...headerIssues(input.headers, https, credentials));
  if (!https && !local) issues.push(plainHttp(input.html));
  if (https) {
    const mixed = mixedContent(input.html);
    if (mixed.length) issues.push(mixedIssue(mixed));
  }
  issues.push(...cookieIssues(cookies, https));
  const third = thirdPartyScripts(input.html, input.origin);
  if (third.length) issues.push(thirdPartyIssue(third));
  if (input.sourceMapUrls.length) issues.push(sourceMapIssue(input.sourceMapUrls));
  if (directoryListing(input.html)) issues.push(directoryIssue());
  issues.push(...clientIssues([...inlineScripts(input.html), ...input.appCode], https));

  const passed: string[] = [];
  const headerGap = /Content-Security-Policy|frame-ancestors|X-Content-Type-Options|Strict-Transport/;
  if (!issues.some((i) => i.kind === "missing_security_headers" && headerGap.test(i.evidence))) {
    passed.push("security_headers");
  }
  const cspGap = issues.some((i) => i.title === "No Content Security Policy" || i.title === "Content Security Policy is not enforced");
  if (!cspGap) passed.push("csp");
  if (https) passed.push("https");
  if (https && !issues.some((i) => i.title === "HTTPS page loads insecure resources")) passed.push("mixed_content");
  if (!issues.some((i) => i.title.startsWith("Cookie") || i.title.startsWith("Session cookie"))) passed.push("cookies");
  if (!input.sourceMapUrls.length) passed.push("source_maps");
  const clientGap = issues.some(
    (i) => i.kind === "xss" || i.title === "Auth data is stored in the browser" || i.title === "Page opens an unencrypted WebSocket",
  );
  if (!clientGap) passed.push("client_code");
  return { issues, passed };
}

/** Extra GETs and one POST. Caller must pass a fetch that does not follow redirects. */
export async function probeOwned(fetchImpl: typeof fetch, origin: string): Promise<SurfaceResult> {
  const [files, cors, graphql] = await Promise.all([
    exposedFiles(fetchImpl, origin),
    reflectedCors(fetchImpl, origin),
    graphqlOpen(fetchImpl, origin),
  ]);
  const issues = [...files, ...(cors ? [cors] : []), ...(graphql ? [graphql] : [])];
  const passed: string[] = [];
  if (!files.length) passed.push("sensitive_files");
  if (!cors) passed.push("cors");
  if (!graphql) passed.push("graphql");
  return { issues, passed };
}

function headerIssues(headers: Headers, https: boolean, credentials: boolean): SurfaceIssue[] {
  const out: SurfaceIssue[] = [];
  const csp = headers.get("content-security-policy");
  const reportOnly = headers.get("content-security-policy-report-only");
  if (!csp && !reportOnly) {
    out.push(
      issue(
        "missing_security_headers",
        "medium",
        "No Content Security Policy",
        "The site never tells the browser which scripts are allowed to run.",
        "An injected script then runs with the same power as the site. That is how stolen sessions and fake login forms land.",
        "The response has no Content-Security-Policy header.",
        "Send a Content-Security-Policy that allows only your own scripts. default-src 'self' is a workable start.",
      ),
    );
  } else if (!csp && reportOnly) {
    out.push(
      issue(
        "missing_security_headers",
        "low",
        "Content Security Policy is not enforced",
        "The site reports policy violations and still lets the browser run whatever script shows up.",
        "A report-only policy does not stop an injected script. It only writes a log after the script has run.",
        "Content-Security-Policy-Report-Only is set, and Content-Security-Policy is not.",
        "Enforce the policy with Content-Security-Policy once legitimate scripts already pass it.",
      ),
    );
  }
  if (!headers.get("x-frame-options") && !/frame-ancestors/i.test(csp ?? "")) {
    out.push(
      issue(
        "missing_security_headers",
        "low",
        "Pages can be embedded in another site",
        "Nothing stops another website from putting this page inside a frame.",
        "A visitor can be tricked into clicking buttons here while they think they are clicking something else.",
        "No X-Frame-Options header, and the enforced Content Security Policy does not set frame-ancestors.",
        "Send X-Frame-Options: DENY, or add frame-ancestors 'none' to the Content Security Policy.",
      ),
    );
  }
  if (!headers.get("x-content-type-options") && sniffableType(headers.get("content-type"))) {
    out.push(
      issue(
        "missing_security_headers",
        "low",
        "Browsers are allowed to guess file types",
        "This response has no X-Content-Type-Options header, and its Content-Type is missing or generic.",
        "A browser may treat that file as a script, which turns an upload into code running on your origin.",
        "The response has no X-Content-Type-Options header, and Content-Type is missing or generic.",
        "Send X-Content-Type-Options: nosniff on every response.",
      ),
    );
  }
  if (https && credentials && !headers.get("strict-transport-security")) {
    out.push(
      issue(
        "missing_security_headers",
        "medium",
        "HTTPS is not locked in",
        "The site is on HTTPS, but it never tells browsers to refuse the plain HTTP version.",
        "The first visit can still be downgraded. Anyone on that network can then read passwords and session cookies.",
        "The response has no Strict-Transport-Security header.",
        "Send Strict-Transport-Security with a max-age of at least a year. Add includeSubDomains only after every host on the domain supports HTTPS.",
      ),
    );
  }
  return out;
}

function plainHttp(html: string): SurfaceIssue {
  const password = passwordField(html);
  return issue(
    "missing_security_headers",
    "high",
    "Site is served over plain HTTP",
    password
      ? "The site is not encrypted, and the page contains a password field."
      : "Nothing on this site is encrypted. Anyone on the network can read the traffic.",
    "Passwords, session cookies, and form data can be copied in transit.",
    password ? "The URL uses http:// and the page contains a password field." : "The URL uses http://, not https://.",
    "Serve the site on HTTPS and redirect every HTTP request to it.",
  );
}

function mixedIssue(urls: string[]): SurfaceIssue {
  const list = urls.slice(0, 4).join(", ");
  return issue(
    "missing_security_headers",
    "high",
    "HTTPS page loads insecure resources",
    "This HTTPS page still pulls in files over plain HTTP.",
    "Someone on the network can replace that file and run code inside the site, or read what the form submits.",
    `Insecure URLs: ${list}`,
    "Load every script, frame, and form over HTTPS. Redirect the HTTP host so the old URLs stop working.",
  );
}

function thirdPartyIssue(hosts: string[]): SurfaceIssue {
  const list = hosts.slice(0, 5).join(", ");
  return issue(
    "missing_security_headers",
    "low",
    "Third-party scripts have no integrity check",
    "The page loads scripts from other sites and does not pin what those files are supposed to contain.",
    "If that other site is compromised, or the file is swapped, the new script runs as part of this site.",
    `No integrity attribute: ${list}`,
    "Self-host the script, or add an integrity hash and a crossorigin attribute.",
  );
}

function sourceMapIssue(urls: string[]): SurfaceIssue {
  return issue(
    "data_leak",
    "medium",
    "Original source code is public",
    "The site publishes a JavaScript source map, so the original code is a public download.",
    "Comments, hidden routes, and anything that was only supposed to exist in the build are readable.",
    `Fetched ${urls.slice(0, 3).join(", ")}`,
    "Stop uploading source maps with the production build.",
  );
}

function directoryIssue(): SurfaceIssue {
  return issue(
    "data_leak",
    "medium",
    "Directory listing is public",
    "The server is showing a file listing instead of a page.",
    "Visitors can browse files that were never linked, including backups and config.",
    "The page title or heading says Index of /.",
    "Turn directory listings off and serve a real page at this path.",
  );
}

function cookieIssues(cookies: { name: string; attrs: string }[], https: boolean): SurfaceIssue[] {
  const out: SurfaceIssue[] = [];
  const session = cookies.filter((c) => SESSION_COOKIE.test(c.name) && !CSRF_COOKIE.test(c.name));
  const noHttpOnly = session.filter((c) => !/\bhttponly\b/i.test(c.attrs));
  if (noHttpOnly.length) {
    out.push(
      issue(
        "data_leak",
        "high",
        "Session cookie is readable by page scripts",
        `The cookie ${quoteNames(noHttpOnly)} is a session cookie without HttpOnly.`,
        "Any script that runs on the page, including an injected one, can copy the session and sign in as that person.",
        noHttpOnly.map((c) => `${c.name}: no HttpOnly`).join("; "),
        "Set HttpOnly on session cookies so document.cookie cannot read them.",
      ),
    );
  }
  const noSameSite = session.filter((c) => !/\bsamesite\s*=\s*(lax|strict)\b/i.test(c.attrs));
  if (noSameSite.length) {
    out.push(
      issue(
        "data_leak",
        "medium",
        "Session cookie is sent on cross-site requests",
        `The cookie ${quoteNames(noSameSite)} does not use SameSite=Lax or SameSite=Strict.`,
        "Another website can trigger a request that still carries this session.",
        noSameSite.map((c) => `${c.name}: SameSite is missing or None`).join("; "),
        "Set SameSite=Lax, or Strict if the cookie is never needed on cross-site navigation.",
      ),
    );
  }
  if (https) {
    const noSecure = session.filter((c) => !/\bsecure\b/i.test(c.attrs));
    if (noSecure.length) {
      out.push(
        issue(
          "data_leak",
          "medium",
          "Cookie is sent over plain HTTP",
          `The cookie ${quoteNames(noSecure)} is missing Secure, so a browser may send it to the HTTP version of the site.`,
          "A network attacker who can downgrade one request receives the cookie.",
          noSecure.map((c) => `${c.name}: no Secure`).join("; "),
          "Set Secure on every cookie served from an HTTPS site.",
        ),
      );
    }
  }
  return out;
}

function clientIssues(files: string[], https: boolean): SurfaceIssue[] {
  const out: SurfaceIssue[] = [];
  const blob = files.join("\n").slice(0, 1_500_000);
  if (!blob) return out;

  const stored = new Set<string>();
  for (const m of blob.matchAll(/(?:localStorage|sessionStorage)\.setItem\(\s*["'`]([^"'`]{1,64})["'`]/g)) {
    if (SENSITIVE_KEY.test(m[1]) && !CSRF_COOKIE.test(m[1])) stored.add(m[1]);
  }
  for (const m of blob.matchAll(/(?:localStorage|sessionStorage)\[\s*["'`]([^"'`]{1,64})["'`]\s*\]\s*=/g)) {
    if (SENSITIVE_KEY.test(m[1]) && !CSRF_COOKIE.test(m[1])) stored.add(m[1]);
  }
  for (const m of blob.matchAll(/document\.cookie\s*=\s*["'`]([^=;"'`\s]{1,64})=/g)) {
    if (SESSION_COOKIE.test(m[1]) && !CSRF_COOKIE.test(m[1])) stored.add(m[1]);
  }
  if (stored.size) {
    const names = [...stored].slice(0, 6);
    out.push(
      issue(
        "data_leak",
        "high",
        "Auth data is stored in the browser",
        `The page script stores ${names.map((n) => `"${n}"`).join(", ")} where any script on the origin can read it.`,
        "A single cross-site scripting bug, or a malicious dependency, can copy that value and reuse the login.",
        `Browser storage keys: ${names.join(", ")}`,
        "Keep session tokens in an HttpOnly cookie. Do not put them in localStorage, sessionStorage, or document.cookie.",
      ),
    );
  }

  const sink = writesUrlIntoHtml(blob);
  if (sink) {
    out.push(
      issue(
        "xss",
        "high",
        "Page writes the URL into HTML",
        "Script on the page takes part of the URL and writes it into the document as HTML.",
        "Anyone who can get a victim to open a crafted link can run JavaScript as that person.",
        "A URL value (location.search, location.hash, location.href, or searchParams) is assigned to innerHTML or outerHTML, or passed to document.write, insertAdjacentHTML, or dangerouslySetInnerHTML.",
        "Insert that value as text, or sanitize it with a library you trust before it becomes HTML.",
      ),
    );
  } else if (/dangerouslySetInnerHTML\s*:\s*\{/.test(blob)) {
    out.push(
      issue(
        "xss",
        "medium",
        "Page inserts raw HTML",
        "The page uses dangerouslySetInnerHTML, which renders a string as real HTML.",
        "If any part of that string comes from a user, a comment, or a CMS, it can run script in your visitors' browsers.",
        "Found dangerouslySetInnerHTML in the page's own script.",
        "Render the value as text. If HTML is required, sanitize it first.",
      ),
    );
  }
  if (!sink && /document\.write\s*\(/.test(blob)) {
    out.push(
      issue(
        "xss",
        "medium",
        "Page is written with document.write",
        "The page calls document.write, which parses a string as HTML.",
        "Whatever ends up in that string runs as part of the site.",
        "Found document.write( in the page's own script.",
        "Build the page with DOM APIs or your framework's text rendering, and delete document.write.",
      ),
    );
  }
  if (/postMessage\s*\([\s\S]{0,200}?["']\*["']/.test(blob)) {
    out.push(
      issue(
        "xss",
        "medium",
        "Page messages any website",
        "A script calls postMessage with \"*\" as the target, or listens in a way that accepts that target.",
        "Any page that has a reference to this window can receive the message, including data you meant for one parent frame.",
        'Found postMessage(..., "*") in the page\'s own script.',
        "Pass the exact origin you mean to talk to, and check event.origin before acting on a message.",
      ),
    );
  }
  if (https && /["'`]ws:\/\//.test(blob)) {
    out.push(
      issue(
        "missing_security_headers",
        "medium",
        "Page opens an unencrypted WebSocket",
        "The HTTPS page connects to a ws:// socket.",
        "Anything sent on that socket, including tokens, can be read or changed on the network.",
        "Found a ws:// URL in the page's own script.",
        "Use wss:// on HTTPS pages.",
      ),
    );
  }
  return out;
}

const FILE_PROBES: {
  path: string;
  severity: Severity;
  title: string;
  plainEnglish: string;
  impact: string;
  fixHint: string;
  test: (body: string) => boolean;
}[] = [
  ...["/.env", "/.env.local", "/.env.production"].map((path) => ({
    path,
    severity: "critical" as const,
    title: `Environment file ${path} is public`,
    plainEnglish: `The site is serving ${path}. That file is where servers keep database passwords and secret keys.`,
    impact: "Anyone can download those secrets and use them.",
    fixHint: "Remove the file from the public host, rotate every secret that was in it, and keep environment files out of the deploy output.",
    test: envFile,
  })),
  {
    path: "/.git/HEAD",
    severity: "high",
    title: "Git metadata is public",
    plainEnglish: "The site is serving .git/HEAD. The rest of the repository is often next to it.",
    impact: "Someone can download the source, including history, ignored files that were committed once, and secrets that were removed later.",
    fixHint: "Stop serving the .git directory. If it was ever public, rotate secrets that appear anywhere in the history.",
    test: (b) => !isHtml(b) && /^ref:\s+refs\//m.test(b.trim()),
  },
  {
    path: "/.git/config",
    severity: "high",
    title: "Git config is public",
    plainEnglish: "The site is serving .git/config, which means the repository checkout is on the public host.",
    impact: "The config names remotes and branches, and the objects next to it are the source code.",
    fixHint: "Remove the .git directory from the host.",
    test: (b) => !isHtml(b) && /\[core\]/.test(b) && /repositoryformatversion/i.test(b),
  },
  {
    path: "/.aws/credentials",
    severity: "critical",
    title: "AWS credentials file is public",
    plainEnglish: "The site is serving an AWS credentials file.",
    impact: "Those keys can be used to spend money and read data in that AWS account.",
    fixHint: "Delete the file, rotate the keys, and keep credential files off the public host.",
    test: (b) => !isHtml(b) && /aws_access_key_id|aws_secret_access_key/i.test(b),
  },
  {
    path: "/wp-config.php",
    severity: "critical",
    title: "WordPress config is public",
    plainEnglish: "wp-config.php is being served as a download. It holds the database password.",
    impact: "Anyone who can read it can connect to the database as the site.",
    fixHint: "Block public access to wp-config.php and rotate the database password.",
    test: (b) => !isHtml(b) && /DB_PASSWORD/.test(b),
  },
];

async function exposedFiles(fetchImpl: typeof fetch, origin: string): Promise<SurfaceIssue[]> {
  const hits = await Promise.all(
    FILE_PROBES.map(async (probe) => {
      const got = await getText(fetchImpl, origin + probe.path);
      if (!got || got.status !== 200 || !probe.test(got.body)) return;
      return issue(
        "data_leak",
        probe.severity,
        probe.title,
        probe.plainEnglish,
        probe.impact,
        `GET ${origin}${probe.path} returned 200 and matches a ${probe.path} file. The body is not stored in this report.`,
        probe.fixHint,
        origin + probe.path,
      );
    }),
  );
  return hits.filter((h): h is SurfaceIssue => Boolean(h));
}

async function reflectedCors(fetchImpl: typeof fetch, origin: string): Promise<SurfaceIssue | undefined> {
  try {
    const res = await fetchImpl(origin + "/", { headers: { origin: "https://antibody.invalid" } });
    const allow = res.headers.get("access-control-allow-origin")?.trim().toLowerCase();
    const creds = (res.headers.get("access-control-allow-credentials") ?? "").toLowerCase() === "true";
    if (!creds || (allow !== "*" && allow !== "https://antibody.invalid")) return;
    return issue(
      "data_leak",
      "high",
      "Any website can call this origin with credentials",
      "The site reflects a foreign Origin and also allows credentials.",
      "A malicious page can read authenticated responses from this site while a visitor is logged in.",
      `Access-Control-Allow-Origin: ${allow}; Access-Control-Allow-Credentials: true`,
      "Allow credentials only for origins you own. Never reflect the request Origin without an allowlist.",
      origin + "/",
    );
  } catch {
    return;
  }
}

async function graphqlOpen(fetchImpl: typeof fetch, origin: string): Promise<SurfaceIssue | undefined> {
  try {
    const res = await fetchImpl(origin + "/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "{ __schema { queryType { name } } }" }),
    });
    if (res.status !== 200) return;
    const body = (await res.text()).slice(0, 4000);
    if (isHtml(body) || !/"__schema"\s*:/.test(body)) return;
    return issue(
      "data_leak",
      "high",
      "GraphQL introspection is enabled",
      "The public /graphql endpoint describes its own schema to anyone who asks.",
      "The schema names queries, mutations, and fields, which is a map of every operation the API supports.",
      `POST ${origin}/graphql returned 200 with a __schema field.`,
      "Disable introspection in production, or require a logged-in admin before returning the schema.",
      origin + "/graphql",
    );
  } catch {
    return;
  }
}

function mixedContent(html: string): string[] {
  const out: string[] = [];
  for (const tag of html.matchAll(/<(script|iframe|embed|object|form|link)\b[^>]*>/gi)) {
    const t = tag[0];
    const kind = tag[1].toLowerCase();
    if (kind === "link" && !/\brel\s*=\s*["'][^"']*stylesheet/i.test(t)) continue;
    const raw = t.match(/\b(?:src|href|action)\s*=\s*["']([^"']+)["']/i)?.[1];
    if (raw && /^http:\/\//i.test(raw)) out.push(raw);
  }
  return out;
}

function thirdPartyScripts(html: string, origin: string): string[] {
  const hosts = new Set<string>();
  for (const tag of html.matchAll(/<script\b[^>]*>/gi)) {
    const t = tag[0];
    if (/\bintegrity\s*=/i.test(t)) continue;
    const src = t.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!src || src.startsWith("data:") || /^http:\/\//i.test(src)) continue;
    const abs = URL.parse(src, origin);
    if (!abs || abs.origin === origin || abs.protocol !== "https:") continue;
    hosts.add(abs.host);
  }
  return [...hosts];
}

function inlineScripts(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1] ?? "";
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const type = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (type && type !== "text/javascript" && type !== "application/javascript" && type !== "module") continue;
    const body = m[2].trim();
    if (body) out.push(body.slice(0, 200_000));
  }
  return out;
}

function directoryListing(html: string): boolean {
  return /<title>\s*Index of \//i.test(html) || /<h1>\s*Index of \//i.test(html);
}

/** Bot walls and interstitials served with HTTP 200. A normal page that mentions one of these words is left alone. */
function challengePage(html: string, finalUrl: string): boolean {
  const path = URL.parse(finalUrl)?.pathname ?? "";
  if (/\/sorry(?:\/|$)/i.test(path)) return true;
  const title = html.match(/<title[^>]*>([^<]{0,180})/i)?.[1]?.trim() ?? "";
  if (/^just a moment/i.test(title) || /attention required/i.test(title)) return true;
  return /unusual traffic|cf-browser-verification|cdn-cgi\/challenge|challenge-platform|checking your browser/i.test(html.slice(0, 4000));
}

function passwordField(html: string): boolean {
  return /<input\b[^>]*\btype\s*=\s*["']password["']/i.test(html);
}

/** Missing or generic type. An explicit text/html (or script, css, json, image) response is not a sniff. */
function sniffableType(contentType: string | null): boolean {
  if (!contentType) return true;
  const type = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return type === "" || type === "text/plain" || type === "application/octet-stream" || type === "binary/octet-stream" || type === "application/x-download";
}

const URL_VALUE = /\blocation\s*\.\s*(?:hash|search|href)\b|\bdocument\s*\.\s*(?:URL|referrer)\b|\bwindow\s*\.\s*name\b|\bsearchParams\b/;

/** True when a URL-derived value is what gets parsed as HTML, not merely near a read of innerHTML/outerHTML. */
function writesUrlIntoHtml(code: string): boolean {
  if (assignedUrl(code, "innerHTML") || assignedUrl(code, "outerHTML")) return true;
  if (callContainsUrl(code, /document\s*\.\s*write(?:ln)?\s*\(/g)) return true;
  if (secondArgContainsUrl(code, /insertAdjacentHTML\s*\(/g)) return true;
  return dangerouslyContainsUrl(code);
}

function assignedUrl(code: string, prop: string): boolean {
  const re = new RegExp(`\\.${prop}\\s*\\+?=\\s*`, "g");
  for (const m of code.matchAll(re)) {
    const at = (m.index ?? 0) + m[0].length;
    if (URL_VALUE.test(statementFrom(code, at))) return true;
  }
  return false;
}

function callContainsUrl(code: string, re: RegExp): boolean {
  for (const m of code.matchAll(re)) {
    const open = (m.index ?? 0) + m[0].length - 1;
    if (code[open] === "(" && URL_VALUE.test(readBalanced(code, open))) return true;
  }
  return false;
}

function secondArgContainsUrl(code: string, re: RegExp): boolean {
  for (const m of code.matchAll(re)) {
    const open = (m.index ?? 0) + m[0].length - 1;
    if (code[open] !== "(") continue;
    const second = splitArgs(readBalanced(code, open))[1] ?? "";
    if (URL_VALUE.test(second)) return true;
  }
  return false;
}

function dangerouslyContainsUrl(code: string): boolean {
  for (const m of code.matchAll(/dangerouslySetInnerHTML\s*:\s*\{/g)) {
    const open = (m.index ?? 0) + m[0].length - 1;
    if (URL_VALUE.test(readBalanced(code, open))) return true;
  }
  return false;
}

function statementFrom(code: string, start: number): string {
  let depth = 0;
  const end = Math.min(code.length, start + 400);
  let i = start;
  for (; i < end; i++) {
    const c = code[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      if (depth === 0) break;
      depth--;
    } else if (c === ";" && depth === 0) break;
  }
  return code.slice(start, i);
}

function readBalanced(code: string, openAt: number): string {
  const open = code[openAt];
  const close = open === "(" ? ")" : open === "{" ? "}" : "]";
  let depth = 0;
  const end = Math.min(code.length, openAt + 800);
  for (let i = openAt; i < end; i++) {
    if (code[i] === open) depth++;
    else if (code[i] === close) {
      depth--;
      if (depth === 0) return code.slice(openAt + 1, i);
    }
  }
  return code.slice(openAt + 1, end);
}

function splitArgs(args: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < args.length; i++) {
    const c = args[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth = Math.max(0, depth - 1);
    else if (c === "," && depth === 0) {
      out.push(args.slice(start, i));
      start = i + 1;
    }
  }
  out.push(args.slice(start));
  return out;
}

function setCookies(headers: Headers): string[] {
  const bag = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof bag.getSetCookie === "function") {
    const list = bag.getSetCookie();
    if (list.length) return list;
  }
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

function parseCookie(raw: string): { name: string; attrs: string } {
  const parts = raw.split(";").map((s) => s.trim());
  const name = parts[0]?.split("=")[0]?.trim() ?? "";
  return { name, attrs: parts.slice(1).join("; ") };
}

function quoteNames(cookies: { name: string }[]): string {
  const names = cookies.slice(0, 6).map((c) => `"${c.name}"`);
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

function envFile(body: string): boolean {
  if (isHtml(body)) return false;
  return /(?:^|\n)\s*[A-Za-z_][A-Za-z0-9_]*\s*=\s*\S+/.test(body);
}

function isHtml(body: string): boolean {
  return /^\s*<(?:!doctype|html|head|body)\b/i.test(body);
}

function isLocal(host: string): boolean {
  const h = host.toLowerCase();
  return h === "localhost" || h.startsWith("localhost:") || h.startsWith("127.0.0.1") || h === "[::1]" || h.startsWith("[::1]");
}

function issue(
  kind: FindingKind,
  severity: Severity,
  title: string,
  plainEnglish: string,
  impact: string,
  evidence: string,
  fixHint: string,
  url?: string,
): SurfaceIssue {
  return { kind, severity, title, plainEnglish, impact, evidence, fixHint, url };
}

async function getText(fetchImpl: typeof fetch, url: string): Promise<{ status: number; body: string } | undefined> {
  try {
    const res = await fetchImpl(url);
    return { status: res.status, body: (await res.text()).slice(0, 4000) };
  } catch {
    return;
  }
}
