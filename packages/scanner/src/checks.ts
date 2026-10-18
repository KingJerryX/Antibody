// The whole check suite as rows (passed / failed / not run), built from a finished report. The report page shows
// these instead of a score, so a scan that skipped the important checks can't look like a clean bill of health.
import type { CheckTier, Finding, FindingKind, ScanCheck, ScanReport } from "@antibody/core";
import { dnsApplies } from "./dns.ts";
import type { ReviewResult } from "./repo-review.ts";

type Row = [id: string, label: string];

// ids are what scanUrl / surface.ts push to `passed` when a check comes back clean.
const PASSIVE: Row[] = [
  ["https", "Served over HTTPS"],
  ["secret_scan", "No secret keys in the page or its scripts"],
  ["security_headers", "Browser protection headers are set"],
  ["csp", "Content Security Policy is enforced"],
  ["dnssec", "DNSSEC signs this domain"],
  ["dmarc", "DMARC rejects forged email"],
  ["mixed_content", "No insecure resources on a secure page"],
  ["cookies", "Cookies are Secure and HttpOnly"],
  ["source_maps", "Source code isn't published"],
  ["client_code", "No tokens or risky code in the browser scripts"],
];
const LIVE: Row[] = [
  ["supabase_rls", "Supabase tables are locked (row-level security)"],
  ["unprotected_routes", "Admin and user data need a login"],
  ["rate_limit", "Login, signup, and AI endpoints are rate limited"],
  ["sensitive_files", "No .env, .git or credential files are served"],
  ["cors", "Other websites can't call your API as your users"],
  ["graphql", "GraphQL isn't open to anyone"],
];
const CODE: [id: string, label: string, kinds: FindingKind[]][] = [
  ["code_keys", "No secret keys written into the code", ["secret_in_bundle"]],
  ["code_auth", "Every API route checks who's asking", ["unprotected_route", "idor"]],
  ["code_rate_limit", "AI routes are rate limited", ["missing_rate_limit"]],
  ["code_webhooks", "Webhooks check their signature", ["unverified_webhook"]],
  ["code_injection", "No raw HTML or SQL built from user input", ["xss", "sql_injection"]],
  ["code_data", "No private data sent to the browser", ["data_leak"]],
];

const LIVE_SKIPPED = "Live checks did not run";
export const liveChecksRan = (report: Pick<ScanReport, "skipped">) => !report.skipped?.some((s) => s.startsWith(LIVE_SKIPPED));

/** `audit` is the code review of the connected repo, or undefined when no repo is connected. */
export function scanChecks(report: ScanReport, audit: ReviewResult | undefined): ScanCheck[] {
  const passed = new Set(report.passed);
  const row = (tier: CheckTier, [id, label]: Row, status: ScanCheck["status"], note?: string): ScanCheck => ({ id, label, tier, status, ...(note && { note }) });
  const https = report.targetUrl.startsWith("https://");
  const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(report.targetUrl);
  const hostname = URL.parse(report.targetUrl)?.hostname ?? "";

  const passive = PASSIVE.flatMap((r): ScanCheck[] => {
    const [id] = r;
    if (id === "mixed_content" && !https) return []; // only means something on an HTTPS page
    if (id === "https" && local) return [row("passive", r, "pass", "Local address, so HTTPS isn't expected.")];
    if ((id === "dnssec" || id === "dmarc") && !dnsApplies(hostname)) {
      return [row("passive", r, "pass", "Local or IP address, so DNS records aren't expected.")];
    }
    const dnsSkip = id === "dnssec" || id === "dmarc" ? report.skipped?.find((s) => s.startsWith(id === "dnssec" ? "DNSSEC check" : "DMARC check")) : undefined;
    if (dnsSkip) return [row("passive", r, "not_run", dnsSkip)];
    return [row("passive", r, passed.has(id) ? "pass" : "fail")];
  });

  const ran = liveChecksRan(report);
  const supabaseSkip = report.skipped?.find((s) => s.startsWith("Supabase at "));
  const live = LIVE.map((r) => {
    if (!ran) return row("live", r, "not_run", "Runs after you connect the Vercel project that hosts this site.");
    if (r[0] === "supabase_rls" && supabaseSkip) return row("live", r, "not_run", supabaseSkip);
    return row("live", r, passed.has(r[0]) ? "pass" : "fail");
  });

  const codeFindings = report.findings.filter((f: Finding) => f.detectedBy === "code_audit" || f.location?.file);
  const unread = !audit ? "Runs once you connect the site's GitHub repo." : audit.note.includes("couldn't clone") ? audit.note : undefined;
  const code = CODE.map(([id, label, kinds]) => {
    if (unread) return row("code", [id, label], "not_run", unread);
    const hits = codeFindings.filter((f) => kinds.includes(f.kind));
    return row("code", [id, label], hits.length ? "fail" : "pass", hits.map((f) => `${f.location?.file}:${f.location?.line}`).slice(0, 3).join(", ") || undefined);
  });

  return [...passive, ...live, ...code];
}
