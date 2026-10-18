import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { scanUrl } from "./index.ts";
import { findSupabase, redact, scanSecrets } from "./secrets.ts";

// Build a JWT whose payload decodes to the given role (signature is junk; we never verify it).
const jwt = (role: string) =>
  "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ role })).toString("base64url") + ".sig";

const ANON = jwt("anon");
const SERVICE = jwt("service_role");
// Fake keys are assembled at runtime so no key-shaped literal sits in the source
// (GitHub push protection blocks those even when they're obviously fake).
const FILLER = "abcdefghijklmnopqrstuvwx";
const OPENAI = ["sk", FILLER].join("-");
const ANTHROPIC = ["sk", "ant", FILLER].join("-");
const STRIPE = ["sk", "live", FILLER].join("_");
const AWS = ["AKIA", "1234567890ABCDEF"].join("");
const SUPA_URL = "https://abcdefgh.supabase.co";

interface Route {
  test: (url: string, init?: RequestInit) => boolean;
  status?: number;
  headers?: Record<string, string>;
  json?: unknown;
  body?: string;
}

/** A fetch mock that routes by URL and records every request it sees. */
function mockFetch(routes: Route[]) {
  const calls: { url: string; method: string }[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, method: (init?.method ?? "GET").toUpperCase() });
    const r = routes.find((x) => x.test(url, init));
    if (!r) return new Response("not found", { status: 404 });
    const body = r.json !== undefined ? JSON.stringify(r.json) : (r.body ?? "");
    return new Response(body, {
      status: r.status ?? 200,
      headers: {
        "content-type": r.json !== undefined ? "application/json" : "text/html",
        ...(r.headers ?? {}),
      },
    });
  }) as typeof fetch;
  return { impl, calls };
}

const SECURE_HEADERS = {
  "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "strict-transport-security": "max-age=63072000",
};

describe("secret detectors (unit)", () => {
  it("finds each key family and redacts it", () => {
    const hits = scanSecrets(`${OPENAI} ${ANTHROPIC} ${STRIPE} ${AWS} ${SERVICE}`);
    const kinds = hits.map((h) => h.kind);
    expect(kinds).toContain("OpenAI API key");
    expect(kinds).toContain("Anthropic API key");
    expect(kinds).toContain("Stripe secret key");
    expect(kinds).toContain("AWS access key");
    expect(kinds).toContain("Supabase service_role key");
    for (const h of hits) {
      expect(h.redacted.length).toBeLessThanOrEqual(5); // 4 chars + "…"
      expect(h.redacted).not.toContain(OPENAI.slice(4));
    }
  });

  it("does not flag an anon key as a secret", () => {
    expect(scanSecrets(ANON)).toHaveLength(0);
  });

  it("discovers a supabase url assigned to SUPABASE_URL (self-hosted or proxied)", () => {
    const hit = findSupabase(`const SUPABASE_URL = "http://localhost:4000/supabase/"; const k = "${ANON}";`);
    expect(hit.url).toBe("http://localhost:4000/supabase");
    expect(hit.anonKey).toBe(ANON);
  });

  it("discovers supabase url + anon key from createClient", () => {
    const s = findSupabase(`const c = createClient("${SUPA_URL}", "${ANON}")`);
    expect(s.url).toBe(SUPA_URL);
    expect(s.anonKey).toBe(ANON);
  });

  it("finds github, slack, database urls, and private keys", () => {
    const github = ["ghp", FILLER].join("_");
    const slack = ["xoxb", FILLER].join("-");
    const db = "postgres://user:secretpass@localhost/db";
    const key = "-----BEGIN PRIVATE KEY-----";
    const kinds = scanSecrets(`${github} ${slack} ${db} ${key}`).map((h) => h.kind);
    expect(kinds).toEqual(expect.arrayContaining(["GitHub token", "Slack token", "Database URL", "Private key"]));
  });

  it("redact keeps only the first 4 chars", () => {
    expect(redact("abcdefgh")).toBe("abcd…");
    expect(redact("ab")).toBe("ab");
  });
});

describe("scanUrl passive", () => {
  it("flags a secret found in a same-origin bundle, redacted", async () => {
    const { impl } = mockFetch([
      { test: (u) => u === "https://site.com/", body: `<script src="/app.js"></script>`, headers: SECURE_HEADERS },
      { test: (u) => u === "https://site.com/app.js", body: `const k="${OPENAI}"` },
    ]);
    const r = await scanUrl("https://site.com/", { projectId: "p1", verifiedDomains: [], fetchImpl: impl });
    const secret = r.findings.find((f) => f.kind === "secret_in_bundle");
    expect(secret).toBeTruthy();
    expect(secret!.evidence).not.toContain(OPENAI.slice(4));
    expect(secret!.detectedBy).toBe("url_scan");
  });

  it("splits missing browser protections by severity instead of one low header finding", async () => {
    const { impl } = mockFetch([{ test: (u) => u === "https://site.com/", body: `<html></html>` }]);
    const r = await scanUrl("https://site.com/", { projectId: "p1", verifiedDomains: [], fetchImpl: impl });
    const titles = r.findings.map((f) => f.title);
    expect(titles).toContain("No Content Security Policy");
    expect(titles).toContain("HTTPS is not locked in");
    expect(r.findings.find((f) => f.title === "No Content Security Policy")?.severity).toBe("medium");
    expect(r.findings.find((f) => f.title === "HTTPS is not locked in")?.severity).toBe("medium");
    expect(r.findings.some((f) => f.title === "Protective HTTP headers")).toBe(false);
    expect(r.passed).not.toContain("security_headers");
  });

  it("passes the header check when all headers are present", async () => {
    const { impl } = mockFetch([
      { test: (u) => u === "https://site.com/", body: `<html></html>`, headers: SECURE_HEADERS },
    ]);
    const r = await scanUrl("https://site.com/", { projectId: "p1", verifiedDomains: [], fetchImpl: impl });
    expect(r.passed).toContain("security_headers");
    expect(r.findings.some((f) => f.kind === "missing_security_headers")).toBe(false);
  });
});

describe("scanUrl active gating", () => {
  it("makes NO active requests against an unverified host", async () => {
    const { impl, calls } = mockFetch([
      {
        test: (u) => u === "https://notmine.com/",
        body: `createClient("${SUPA_URL}", "${ANON}")`,
        headers: SECURE_HEADERS,
      },
    ]);
    const r = await scanUrl("https://notmine.com/", {
      projectId: "p1",
      verifiedDomains: ["localhost:4000"],
      fetchImpl: impl,
    });
    // only the page itself was fetched — no RLS, route, or rate-limit probes
    expect(calls.every((c) => c.url === "https://notmine.com/")).toBe(true);
    expect(calls.some((c) => c.url.includes("/rest/v1/"))).toBe(false);
    expect(calls.some((c) => c.url.includes("/api/"))).toBe(false);
    expect(r.skipped?.some((s) => s.startsWith("Live checks did not run"))).toBe(true);
    expect(r.passed).not.toContain("verify domain ownership to run active checks");
  });

  it("runs active checks against a verified host and reports what it finds", async () => {
    const { impl, calls } = mockFetch([
      {
        test: (u) => u === "http://localhost:4000/",
        body: `<script src="/b.js"></script>`,
        headers: SECURE_HEADERS,
      },
      { test: (u) => u === "http://localhost:4000/b.js", body: `createClient("${SUPA_URL}","${ANON}");k="${OPENAI}"` },
      { test: (u) => u.startsWith(`${SUPA_URL}/rest/v1/users`), json: [{ id: 1, email: "a@b.com" }] },
      { test: (u) => u.startsWith(`${SUPA_URL}/rest/v1/`), json: [] }, // other tables empty
      { test: (u) => u === "http://localhost:4000/api/admin", json: { secret: true } },
      { test: (u) => u === "http://localhost:4000/api/users", json: [{ id: 1 }] },
      { test: (u) => u === "http://localhost:4000/api/users/1", json: { id: 1, email: "a@b.com" } },
      { test: (u) => u === "http://localhost:4000/api/users/2", json: { id: 2, email: "c@d.com" } },
      { test: (u) => u === "http://localhost:4000/api/chat", status: 200, json: { reply: "hi" } },
    ]);
    const r = await scanUrl("http://localhost:4000/", {
      projectId: "p1",
      verifiedDomains: ["localhost:4000", "abcdefgh.supabase.co"],
      fetchImpl: impl,
    });
    const kinds = r.findings.map((f) => f.kind);
    expect(kinds).toContain("supabase_rls_disabled");
    expect(kinds).toContain("secret_in_bundle");
    expect(kinds).toContain("unprotected_route");
    expect(kinds).toContain("idor");
    expect(kinds).toContain("missing_rate_limit");

    const rls = r.findings.find((f) => f.kind === "supabase_rls_disabled")!;
    expect(rls.title).toContain("users");
    expect(rls.evidence).not.toContain(ANON.slice(4)); // anon key redacted in evidence

    // 25 POSTs to /api/chat with no 429 triggers the finding
    expect(calls.filter((c) => c.url.endsWith("/api/chat") && c.method === "POST")).toHaveLength(25);
  });

  it("does not flag rate limiting when /api/chat returns 429", async () => {
    const { impl } = mockFetch([
      { test: (u) => u === "http://localhost:4000/", body: `<html></html>`, headers: SECURE_HEADERS },
      { test: (u) => u === "http://localhost:4000/api/chat", status: 429, body: "slow down" },
    ]);
    const r = await scanUrl("http://localhost:4000/", {
      projectId: "p1",
      verifiedDomains: ["localhost:4000"],
      fetchImpl: impl,
    });
    expect(r.findings.some((f) => f.kind === "missing_rate_limit")).toBe(false);
    expect(r.passed).toContain("rate_limit");
  });

  it("never probes an unverified Supabase host, even when the target is verified", async () => {
    const { impl, calls } = mockFetch([
      { test: (u) => u === "http://localhost:4000/", body: `createClient("${SUPA_URL}", "${ANON}")`, headers: SECURE_HEADERS },
    ]);
    const r = await scanUrl("http://localhost:4000/", { projectId: "p1", verifiedDomains: ["localhost:4000"], fetchImpl: impl });
    expect(calls.some((c) => c.url.startsWith(SUPA_URL))).toBe(false);
    expect(r.skipped?.some((s) => s.includes("abcdefgh.supabase.co"))).toBe(true);
    expect(r.passed?.some((s) => s.includes("supabase"))).toBe(false);
  });

  it("never follows an active-probe redirect onto an unverified host (real fetch)", async () => {
    const hits: string[] = [];
    const listen = (h: Parameters<typeof createServer>[1]) =>
      new Promise<Server>((ok) => { const s = createServer(h); s.listen(0, "127.0.0.1", () => ok(s)); });
    const port = (s: Server) => (s.address() as AddressInfo).port;
    const victim = await listen((req, res) => { hits.push(`${req.method} ${req.url}`); res.writeHead(200, { "content-type": "application/json" }).end('{"stolen":true}'); });
    const target = await listen((req, res) => {
      if (req.url === "/") return res.writeHead(200, { "content-type": "text/html" }).end("<html></html>");
      res.writeHead(req.method === "POST" ? 307 : 302, { location: `http://127.0.0.1:${port(victim)}/stolen` }).end();
    });
    try {
      const host = `127.0.0.1:${port(target)}`;
      const r = await scanUrl(`http://${host}/`, { projectId: "p1", verifiedDomains: [host] });
      expect(hits).toEqual([]);
      expect(r.findings.some((f) => f.kind === "unprotected_route" || f.kind === "missing_rate_limit")).toBe(false);
    } finally {
      target.close();
      victim.close();
    }
  });

  it("scans app bundles before vendor chunks so the bundle cap can't hide them", async () => {
    const vendor = Array.from({ length: 15 }, (_, i) => `<script src="/_next/static/chunks/node_modules_react_${i}.js"></script>`).join("");
    const { impl } = mockFetch([
      { test: (u) => u === "http://localhost:4000/", body: vendor + `<script src="/_next/static/chunks/app.js"></script>`, headers: SECURE_HEADERS },
      { test: (u) => u.endsWith("/app.js"), body: `k="${OPENAI}"` },
    ]);
    const r = await scanUrl("http://localhost:4000/", { projectId: "p1", verifiedDomains: [], fetchImpl: impl });
    expect(r.findings.some((f) => f.kind === "secret_in_bundle")).toBe(true);
  });

  it("probes an /api path named in the bundle when the host is verified", async () => {
    const { impl, calls } = mockFetch([
      { test: (u) => u === "http://localhost:4000/", body: `<script src="/app.js"></script>`, headers: SECURE_HEADERS },
      { test: (u) => u === "http://localhost:4000/app.js", body: `fetch("/api/incidents")` },
      { test: (u) => u === "http://localhost:4000/api/incidents", json: { incidents: [{ id: 1 }] } },
    ]);
    const r = await scanUrl("http://localhost:4000/", { projectId: "p1", verifiedDomains: ["localhost:4000"], fetchImpl: impl });
    expect(calls.some((c) => c.url === "http://localhost:4000/api/incidents")).toBe(true);
    expect(r.findings.some((f) => f.kind === "unprotected_route" && f.title.includes("/api/incidents"))).toBe(true);
  });

  it("does not probe a discovered /api path on an unverified host", async () => {
    const { impl, calls } = mockFetch([
      { test: (u) => u === "https://site.com/", body: `<script src="/app.js"></script>`, headers: SECURE_HEADERS },
      { test: (u) => u === "https://site.com/app.js", body: `fetch("/api/incidents")` },
    ]);
    await scanUrl("https://site.com/", { projectId: "p1", verifiedDomains: [], fetchImpl: impl });
    expect(calls.some((c) => c.url.includes("/api/incidents"))).toBe(false);
  });

  it("reads a same-origin source map into the secret scan", async () => {
    const { impl, calls } = mockFetch([
      { test: (u) => u === "https://site.com/", body: `<script src="/app.js"></script>`, headers: SECURE_HEADERS },
      { test: (u) => u === "https://site.com/app.js", body: "function a(){}\n//# sourceMappingURL=/app.js.map" },
      { test: (u) => u === "https://site.com/app.js.map", body: JSON.stringify({ sourcesContent: [`const k="${OPENAI}"`] }) },
    ]);
    const r = await scanUrl("https://site.com/", { projectId: "p1", verifiedDomains: [], fetchImpl: impl });
    expect(calls.some((c) => c.url === "https://site.com/app.js.map")).toBe(true);
    expect(r.findings.some((f) => f.kind === "secret_in_bundle")).toBe(true);
    expect(r.findings.some((f) => f.title === "Original source code is public")).toBe(true);
  });

  it("flags a public env file on a verified host and keeps the body out of the report", async () => {
    const { impl, calls } = mockFetch([
      { test: (u) => u === "http://localhost:4000/", body: "<html></html>", headers: SECURE_HEADERS },
      { test: (u) => u === "http://localhost:4000/.env", body: "DATABASE_URL=postgres://user:secretpass@localhost/db\n" },
    ]);
    const r = await scanUrl("http://localhost:4000/", { projectId: "p1", verifiedDomains: ["localhost:4000"], fetchImpl: impl });
    const env = r.findings.find((f) => f.title.includes("Environment file"));
    expect(calls.some((c) => c.url === "http://localhost:4000/.env")).toBe(true);
    expect(env?.severity).toBe("critical");
    expect(env?.evidence).not.toContain("secretpass");
  });

  it("does not call a public site insecure just because it is plain HTTP on localhost", async () => {
    const { impl } = mockFetch([{ test: (u) => u === "http://localhost:4000/", body: "<html></html>", headers: SECURE_HEADERS }]);
    const r = await scanUrl("http://localhost:4000/", { projectId: "p1", verifiedDomains: [], fetchImpl: impl });
    expect(r.findings.some((f) => f.title === "Site is served over plain HTTP")).toBe(false);
  });

  it("runs live checks on an unlisted host its owner proved through Vercel", async () => {
    const { impl, calls } = mockFetch([
      { test: (u) => u === "https://mine.example/", body: "<html></html>", headers: SECURE_HEADERS },
      { test: (u) => u === "https://mine.example/api/admin", json: { users: 3 } },
    ]);
    const r = await scanUrl("https://mine.example/", { projectId: "p1", verifiedDomains: [], owned: true, fetchImpl: impl });
    expect(calls.some((c) => c.url === "https://mine.example/api/admin")).toBe(true);
    expect(r.findings.some((f) => f.kind === "unprotected_route")).toBe(true);
    expect(r.skipped ?? []).toEqual([]);
  });

  it("refuses live checks without proof, even if the page claims ownership", async () => {
    const { impl, calls } = mockFetch([
      { test: (u) => u === "https://mine.example/", body: `<meta name="antibody-verify" content="mine.example"><html></html>`, headers: SECURE_HEADERS },
    ]);
    const r = await scanUrl("https://mine.example/", { projectId: "p1", verifiedDomains: [], fetchImpl: impl });
    expect(calls.some((c) => c.url.includes("/api/"))).toBe(false);
    expect(r.skipped?.some((s) => s.includes("connect the Vercel project"))).toBe(true);
  });

  it("errors cleanly on an unreachable target", async () => {
    const impl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    const r = await scanUrl("http://localhost:4000/", { projectId: "p1", verifiedDomains: [], fetchImpl: impl });
    expect(r.status).toBe("error");
    expect(r.error).toContain("ECONNREFUSED");
  });
});
