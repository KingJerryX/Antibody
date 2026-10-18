import { describe, expect, it } from "vitest";
import { inspectSurface, probeOwned, unverifiedPage } from "./surface.ts";

const SECURE = new Headers({
  "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "strict-transport-security": "max-age=63072000",
});

function page(html: string, headers = SECURE, extras?: Partial<Parameters<typeof inspectSurface>[0]>) {
  return inspectSurface({
    html,
    headers,
    origin: "https://site.com",
    host: "site.com",
    appCode: [],
    sourceMapUrls: [],
    ...extras,
  });
}

describe("inspectSurface", () => {
  it("passes a locked-down page", () => {
    const r = page("<html></html>");
    expect(r.issues).toEqual([]);
    expect(r.passed).toContain("security_headers");
    expect(r.passed).toContain("csp");
    expect(r.passed).toContain("https");
  });

  it("does not collapse missing protections into one low finding", () => {
    const r = page(`<form><input type="password"></form>`, new Headers());
    const titles = r.issues.map((i) => `${i.severity}:${i.title}`);
    expect(titles).toContain("medium:No Content Security Policy");
    expect(titles).toContain("medium:HTTPS is not locked in");
    expect(titles).toContain("low:Pages can be embedded in another site");
    expect(titles).toContain("low:Browsers are allowed to guess file types");
    expect(r.passed).not.toContain("security_headers");
    expect(r.passed).not.toContain("csp");
  });

  it("does not flag a typed HTML page that has nothing to downgrade", () => {
    const headers = new Headers({ "content-type": "text/html; charset=utf-8" });
    const r = page("<html></html>", headers);
    const titles = r.issues.map((i) => i.title);
    expect(titles).not.toContain("HTTPS is not locked in");
    expect(titles).not.toContain("Browsers are allowed to guess file types");
    expect(titles).toContain("No Content Security Policy");
  });

  it("flags public HTTP and leaves localhost alone", () => {
    const pub = inspectSurface({
      html: `<form><input type="password" name="p"></form>`,
      headers: SECURE,
      origin: "http://example.com",
      host: "example.com",
      appCode: [],
      sourceMapUrls: [],
    });
    expect(pub.issues.some((i) => i.severity === "high" && i.title === "Site is served over plain HTTP")).toBe(true);
    expect(pub.issues.find((i) => i.title === "Site is served over plain HTTP")?.evidence).toContain("password");

    const local = inspectSurface({
      html: "<html></html>",
      headers: SECURE,
      origin: "http://localhost:4000",
      host: "localhost:4000",
      appCode: [],
      sourceMapUrls: [],
    });
    expect(local.issues.some((i) => i.title === "Site is served over plain HTTP")).toBe(false);
  });

  it("flags insecure script loads, third-party scripts, and a public source map", () => {
    const r = page(`<script src="http://cdn.example/app.js"></script><script src="https://cdn.example/a.js"></script>`, SECURE, {
      sourceMapUrls: ["https://site.com/app.js.map"],
    });
    expect(r.issues.some((i) => i.severity === "high" && i.title === "HTTPS page loads insecure resources")).toBe(true);
    expect(r.issues.some((i) => i.title === "Third-party scripts have no integrity check")).toBe(true);
    expect(r.issues.some((i) => i.title === "Original source code is public")).toBe(true);
  });

  it("flags a session cookie without HttpOnly and a token in localStorage", () => {
    const headers = new Headers(SECURE);
    headers.append("set-cookie", "session=abc; Path=/");
    const r = page("<html></html>", headers, { appCode: [`localStorage.setItem("access_token", "eyJhbGci")`] });
    expect(r.issues.some((i) => i.severity === "high" && i.title === "Session cookie is readable by page scripts")).toBe(true);
    expect(r.issues.some((i) => i.title === "Cookie is sent over plain HTTP")).toBe(true);
    expect(r.issues.some((i) => i.severity === "high" && i.title === "Auth data is stored in the browser")).toBe(true);

    const prefs = new Headers(SECURE);
    prefs.append("set-cookie", "NID=abc; Path=/; Domain=.site.com; HttpOnly");
    const quiet = page("<html></html>", prefs);
    expect(quiet.issues.some((i) => i.title.startsWith("Cookie") || i.title.startsWith("Session cookie"))).toBe(false);
  });

  it("does not treat a typed homepage with a report-only policy as a broken app", () => {
    const headers = new Headers({
      "content-type": "text/html; charset=UTF-8",
      "content-security-policy-report-only": "object-src 'none'",
      "x-frame-options": "SAMEORIGIN",
    });
    headers.append("set-cookie", "NID=abc; Path=/; Secure; HttpOnly");
    const r = page(
      `<html><script>h===window.location.href&&(g=document.documentElement.outerHTML.split("\\n"))</script></html>`,
      headers,
    );
    expect(r.issues.map((i) => i.title)).toEqual(["Content Security Policy is not enforced"]);
    expect(r.passed).toContain("security_headers");
  });

  it("flags URL data written into HTML and ignores vendor-free safe code", () => {
    const bad = page("<html></html>", SECURE, { appCode: [`el.innerHTML = location.search`] });
    expect(bad.issues.some((i) => i.severity === "high" && i.kind === "xss")).toBe(true);
    const write = page("<html></html>", SECURE, { appCode: [`document.write(location.hash)`] });
    expect(write.issues.some((i) => i.severity === "high" && i.title === "Page writes the URL into HTML")).toBe(true);
    const adjacent = page("<html></html>", SECURE, { appCode: [`el.innerHTML = "<b>ok</b>"; location.href = "/next"`] });
    expect(adjacent.issues.some((i) => i.title === "Page writes the URL into HTML")).toBe(false);
    const read = page("<html></html>", SECURE, {
      appCode: [`h===window.location.href&&(g=document.documentElement.outerHTML.split("\\n"))`],
    });
    expect(read.issues.some((i) => i.kind === "xss")).toBe(false);
    const ok = page("<html></html>", SECURE, { appCode: [`el.textContent = "hi"`] });
    expect(ok.issues.some((i) => i.kind === "xss")).toBe(false);
  });
});

describe("unverifiedPage", () => {
  it("leaves a normal document alone and skips blocks, challenges, and errors", () => {
    expect(unverifiedPage(200, "<html><title>Notes</title></html>", "https://site.com/")).toBeUndefined();
    expect(unverifiedPage(200, "<html>Our systems have detected unusual traffic from your computer network.</html>", "https://www.google.com/")).toBeTruthy();
    expect(unverifiedPage(200, "<html><title>Just a moment...</title></html>", "https://site.com/")).toBeTruthy();
    expect(unverifiedPage(429, "<html><input type='password'><script>el.innerHTML = location.search</script></html>", "https://www.google.com/sorry/index")).toBeTruthy();
    expect(unverifiedPage(200, "   ", "https://site.com/")).toBeTruthy();
    expect(unverifiedPage(404, "<html>missing</html>", "https://site.com/missing")).toBeTruthy();
  });
});

describe("probeOwned", () => {
  it("flags an env file and does not keep the secret", async () => {
    const impl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/.env")) return new Response("DATABASE_URL=postgres://user:secretpass@localhost/db\n", { status: 200 });
      return new Response("no", { status: 404 });
    }) as typeof fetch;
    const r = await probeOwned(impl, "http://localhost:4000");
    const env = r.issues.find((i) => i.title.includes("/.env"));
    expect(env?.severity).toBe("critical");
    expect(JSON.stringify(env)).not.toContain("secretpass");
  });

  it("does not treat an HTML app shell as an env file", async () => {
    const impl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/.env")) {
        return new Response("<!doctype html><script>const API_KEY=\"abc\"</script>", { status: 200 });
      }
      return new Response("no", { status: 404 });
    }) as typeof fetch;
    const r = await probeOwned(impl, "https://site.com");
    expect(r.issues.some((i) => i.title.includes("Environment file"))).toBe(false);
    expect(r.passed).toContain("sensitive_files");
  });

  it("flags reflected CORS with credentials and open GraphQL introspection", async () => {
    const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/graphql") && init?.method === "POST") {
        return new Response(JSON.stringify({ data: { __schema: { queryType: { name: "Query" } } } }), { status: 200 });
      }
      return new Response("ok", {
        status: 200,
        headers: { "access-control-allow-origin": "https://antibody.invalid", "access-control-allow-credentials": "true" },
      });
    }) as typeof fetch;
    const r = await probeOwned(impl, "https://site.com");
    expect(r.issues.some((i) => i.title === "Any website can call this origin with credentials")).toBe(true);
    expect(r.issues.some((i) => i.title === "GraphQL introspection is enabled")).toBe(true);
  });
});
