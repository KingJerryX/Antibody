import { expect, it } from "vitest";
import type { Finding, ScanReport } from "@antibody/core";
import { scanChecks } from "./checks.ts";

const base: ScanReport = { id: "s", projectId: "p", targetUrl: "https://site.com/", status: "done", startedAt: "", findings: [], passed: [] };
const status = (checks: ReturnType<typeof scanChecks>) => Object.fromEntries(checks.map((c) => [c.id, c.status]));

it("marks live and code checks not run when the site isn't proven and no repo is connected", () => {
  const report = { ...base, passed: ["https", "secret_scan", "cookies"], skipped: ["Live checks did not run. They call this site's API…"] };
  const s = status(scanChecks(report, undefined));
  expect(s).toMatchObject({ https: "pass", secret_scan: "pass", cookies: "pass", security_headers: "fail", supabase_rls: "not_run", cors: "not_run", code_auth: "not_run" });
});

it("treats DNS as passed on a local address and as not run when the lookup was skipped", () => {
  const local = scanChecks({ ...base, targetUrl: "http://localhost:4000/" }, undefined);
  expect(local.find((c) => c.id === "dnssec")).toMatchObject({ status: "pass", note: "Local or IP address, so DNS records aren't expected." });
  expect(local.find((c) => c.id === "dmarc")?.status).toBe("pass");

  const skipped = scanChecks({ ...base, skipped: ["DNSSEC check did not run. The DNS lookup failed.", "DMARC check did not run. The DNS lookup failed."] }, undefined);
  expect(skipped.find((c) => c.id === "dnssec")?.status).toBe("not_run");
  expect(skipped.find((c) => c.id === "dmarc")?.status).toBe("not_run");
  expect(skipped.find((c) => c.id === "csp")?.status).toBe("fail");
});

it("does not fail page checks when the response was a block or an error", () => {
  const report = {
    ...base,
    skipped: [
      "Page review did not run. The response was a block, challenge, or error page, so header and script findings were not scored.",
      "Live checks did not run. The homepage was a block, challenge, or error page, so they were not scored.",
    ],
  };
  const checks = scanChecks(report, undefined);
  expect(checks.find((c) => c.id === "csp")?.status).toBe("not_run");
  expect(checks.find((c) => c.id === "client_code")?.status).toBe("not_run");
  expect(checks.find((c) => c.id === "https")?.status).toBe("not_run");
  expect(checks.find((c) => c.id === "dnssec")?.status).toBe("fail");
  expect(checks.find((c) => c.id === "supabase_rls")).toMatchObject({ status: "not_run", note: expect.stringContaining("block, challenge, or error page") });
});

it("reports live results once the site is proven, and code results from the audit", () => {
  const idor = { kind: "idor", detectedBy: "code_audit", location: { file: "app/api/users/[id]/route.ts", line: 4 } } as Finding;
  const report = { ...base, findings: [idor], passed: ["https", "rate_limit", "sensitive_files", "cors", "graphql", "supabase_rls"] };
  const checks = scanChecks(report, { findings: [idor], note: "Code audit (Semgrep): 1 issue" });
  expect(status(checks)).toMatchObject({ unprotected_routes: "fail", rate_limit: "pass", code_auth: "fail", code_keys: "pass" });
  expect(checks.find((c) => c.id === "code_auth")?.note).toBe("app/api/users/[id]/route.ts:4");
});
