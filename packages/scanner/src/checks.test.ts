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

it("reports live results once the site is proven, and code results from the audit", () => {
  const idor = { kind: "idor", detectedBy: "code_audit", location: { file: "app/api/users/[id]/route.ts", line: 4 } } as Finding;
  const report = { ...base, findings: [idor], passed: ["https", "rate_limit", "sensitive_files", "cors", "graphql", "supabase_rls"] };
  const checks = scanChecks(report, { findings: [idor], note: "Code audit (Semgrep): 1 issue" });
  expect(status(checks)).toMatchObject({ unprotected_routes: "fail", rate_limit: "pass", code_auth: "fail", code_keys: "pass" });
  expect(checks.find((c) => c.id === "code_auth")?.note).toBe("app/api/users/[id]/route.ts:4");
});
