// Static half of a scan: Semgrep with Antibody's rules (semgrep/antibody.yml) over the app's source.
// The live half (index.ts) proves holes on the running app; mergeFindings joins the two.
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { cloneProjectRepo, newId, repoRoot, type Finding, type FindingKind, type Project, type Severity } from "@antibody/core";
import { reviewRepo, type ReviewResult } from "./repo-review.ts";

const run = promisify(execFile);
const AUDIT_TIMEOUT_MS = 120_000;
const ROUTE_FILE = /(?:^|\/)app(\/.*?)\/route\.[jt]sx?$/;

interface SemgrepResult {
  check_id: string;
  path: string;
  start: { line: number };
  extra: { message: string; metadata: { antibody_kind: FindingKind; antibody_severity: Severity; impact: string; fix_hint: string } };
}

/** "app/api/users/[id]/route.ts" -> "/api/users/[id]". */
export const routeFromFile = (file: string) => ROUTE_FILE.exec(file)?.[1];

const titleFor = (kind: FindingKind, route: string | undefined): string => {
  const where = route ? `"${route}"` : "This code";
  switch (kind) {
    case "secret_in_bundle": return "Secret API key written into your code";
    case "idor": return `${where} returns any record without checking who's asking`;
    case "unprotected_route": return `${where} has no login check`;
    case "missing_rate_limit": return `${where} has no rate limit`;
    case "unverified_webhook": return `${where} trusts webhooks without checking the signature`;
    case "xss": return "Raw HTML is injected into the page";
    case "bug": return "This code can break on a normal request";
    case "data_leak": return "Private data is written where other people can read it";
    case "optimization": return "This loads more data than the page needs";
    default: return "Risky code pattern";
  }
};

/** Runs Semgrep on repoDir. Never throws: if Semgrep is missing or fails, returns no findings and a note. */
export async function auditCode(repoDir: string, projectId: string): Promise<{ findings: Finding[]; note: string }> {
  const rules = join(repoRoot(), "semgrep", "antibody.yml");
  let stdout: string;
  try {
    ({ stdout } = await run("semgrep", ["scan", "--config", rules, "--json", "--quiet", "--metrics=off", repoDir], {
      timeout: AUDIT_TIMEOUT_MS,
      maxBuffer: 32 * 1024 * 1024,
    }));
  } catch (err) {
    const missing = (err as NodeJS.ErrnoException).code === "ENOENT";
    return { findings: [], note: `Code audit skipped: ${missing ? "Semgrep isn't installed" : (err as Error).message.split("\n")[0]}` };
  }

  const now = new Date().toISOString();
  const findings = (JSON.parse(stdout) as { results: SemgrepResult[] }).results.map((r): Finding => {
    const file = relative(repoDir, r.path).replaceAll("\\", "/");
    const route = routeFromFile(file);
    const meta = r.extra.metadata;
    // One rule covers every unauthenticated route; a [param] segment means records are fetched by id (IDOR).
    const kind = meta.antibody_kind === "unprotected_route" && route?.includes("[") ? "idor" : meta.antibody_kind;
    return {
      id: newId("find"),
      projectId,
      kind,
      severity: meta.antibody_severity,
      title: titleFor(kind, route),
      plainEnglish: r.extra.message,
      impact: meta.impact,
      // Never echo the matched line: it may be the secret itself.
      evidence: `${r.check_id.split(".").pop()} matched ${file}:${r.start.line}`,
      location: { file, line: r.start.line },
      fixHint: meta.fix_hint,
      detectedBy: "code_audit",
      createdAt: now,
    };
  });
  return { findings, note: `Code audit (Semgrep): ${findings.length} issue${findings.length === 1 ? "" : "s"} in source` };
}

const findingKey = (f: Finding) => `${f.kind}|${f.location?.file ?? ""}|${f.location?.line ?? ""}`;

/** Semgrep, then pattern checks and Grok. Semgrep stays separate so fix verification does not call the model. */
export async function auditRepo(repoDir: string, projectId: string): Promise<ReviewResult> {
  const [semgrep, review] = await Promise.all([auditCode(repoDir, projectId), reviewRepo(repoDir, projectId)]);
  const seen = new Set(semgrep.findings.map(findingKey));
  const extra = review.findings.filter((f) => !seen.has(findingKey(f)));
  return {
    findings: [...semgrep.findings, ...extra],
    note: [semgrep.note, review.note].filter(Boolean).join(". "),
    skipped: review.skipped,
  };
}

/** Audits a fresh clone of the project's connected GitHub repo, then deletes the clone. */
export async function auditGithubRepo(project: Project): Promise<ReviewResult> {
  const scratch = join(repoRoot(), ".antibody-work");
  mkdirSync(scratch, { recursive: true });
  const work = mkdtempSync(join(scratch, "scan-"));
  try {
    const dir = join(work, "repo");
    await cloneProjectRepo(project, dir);
    const audit = await auditRepo(dir, project.id);
    return { ...audit, note: `${audit.note} (${project.repo} on GitHub)` };
  } catch (err) {
    return { findings: [], note: `Code audit skipped: couldn't clone ${project.repo} (${(err as Error).message.split("\n")[0]})` };
  } finally {
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
}

/** "/api/users/[id]" -> /^\/api\/users\/[^/]+$/ */
const routePattern = (route: string) => new RegExp(`^${route.replace(/\[[^\]]+\]/g, "[^/]+").replace(/\//g, "\\/")}$`);

/**
 * A code finding the live scan also proved becomes one finding: the live proof plus the file and line to fix.
 * Code findings with no live proof are kept as "found in code".
 */
export function mergeFindings(live: Finding[], code: Finding[]): Finding[] {
  const merged = live.map((f) => ({ ...f, location: { ...f.location } }));
  const unproven: Finding[] = [];
  for (const c of code) {
    const route = c.location?.file ? routeFromFile(c.location.file) : undefined;
    const proof = merged.find(
      (l) =>
        l.kind === c.kind &&
        !l.location?.file &&
        (!route || routePattern(route).test(URL.parse(l.location?.url ?? "")?.pathname ?? "")),
    );
    if (!proof) {
      unproven.push(c);
      continue;
    }
    proof.location = { ...proof.location, file: c.location?.file, line: c.location?.line };
    proof.evidence += `\nAlso found in code: ${c.location?.file}:${c.location?.line}`;
  }
  return [...merged, ...unproven];
}
