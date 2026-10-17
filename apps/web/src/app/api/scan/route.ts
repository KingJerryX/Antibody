import { after } from "next/server";
import { isGithubConnected, logActivity, newId, updateDb, type Project, type ScanReport } from "@antibody/core";
import { auditCode, auditGithubRepo, mergeFindings, scanUrl } from "@antibody/scanner";
import { repoDirFor, verifiedDomains } from "@/lib/server";

function parseTarget(raw: unknown): URL | null {
  if (typeof raw !== "string" || !raw.trim() || raw.length > 2048) return null;
  const s = raw.trim();
  const u = URL.parse(/^https?:\/\//i.test(s) ? s : `http://${s}`);
  return u?.protocol === "http:" || u?.protocol === "https:" ? u : null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const target = parseTarget(body?.url);
    if (!target) return Response.json({ error: "Enter a valid http(s) URL, like http://localhost:4000" }, { status: 400 });

    const domains = verifiedDomains();
    const now = new Date().toISOString();
    const scanId = newId("scan");

    const project = await updateDb((db) => {
      const verifiedDomain = domains.includes(target.host.toLowerCase());
      let p = db.projects.find((x) => x.url === target.origin);
      if (!p) {
        // Deterministic id (proj_localhost-4000) so the sample app's shield can report blocks to the same project.
        p = { id: `proj_${target.host.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, name: target.host, url: target.origin, verifiedDomain, createdAt: now } satisfies Project;
        db.projects.push(p);
      }
      p.verifiedDomain = verifiedDomain; // the env list is the source of truth
      const scan: ScanReport = { id: scanId, projectId: p.id, targetUrl: target.href, status: "running", startedAt: now, findings: [], passed: [] };
      db.scans.push(scan);
      return p;
    });

    await logActivity({ projectId: project.id, type: "scan_started", title: `Scanning ${target.host}`, channel: "web", refId: scanId });

    const finish = async (): Promise<ScanReport> => {
      let report: ScanReport;
      try {
        // Live probes and the Semgrep code audit run side by side, then merge: proof from one, file:line from the other.
        // Code comes from the project's connected GitHub repo, else a local folder (ANTIBODY_REPOS).
        const repoDir = repoDirFor(target.host);
        const [result, audit] = await Promise.all([
          scanUrl(target.href, { projectId: project.id, verifiedDomains: domains, live: body?.live === true }),
          isGithubConnected(project) ? auditGithubRepo(project) : repoDir ? auditCode(repoDir, project.id) : undefined,
        ]);
        report = { ...result, id: scanId, projectId: project.id, status: result.status === "running" ? "done" : result.status, finishedAt: result.finishedAt ?? new Date().toISOString() };
        if (audit && report.status === "done") {
          report.findings = mergeFindings(report.findings, audit.findings);
          report.passed = [...report.passed, audit.note];
        }
      } catch (err) {
        report = { id: scanId, projectId: project.id, targetUrl: target.href, status: "error", startedAt: now, finishedAt: new Date().toISOString(), findings: [], passed: [], error: err instanceof Error ? err.message : "Scan failed" };
      }
      await updateDb((db) => {
        const i = db.scans.findIndex((s) => s.id === scanId);
        if (i >= 0) db.scans[i] = report;
        else db.scans.push(report);
      });
      const serious = report.findings.filter((f) => f.severity === "critical" || f.severity === "high");
      await logActivity({
        projectId: project.id,
        type: "scan_done",
        title: report.status === "error" ? `Scan of ${target.host} failed` : `Scan done: ${report.findings.length} issue${report.findings.length === 1 ? "" : "s"} found`,
        detail: report.error ?? `${serious.length} critical/high, ${report.passed.length} checks passed`,
        channel: "web",
        refId: scanId,
      });
      for (const f of serious) {
        await logActivity({ projectId: project.id, type: "finding", title: f.title, detail: f.plainEnglish, channel: "web", refId: f.id });
      }
      return report;
    };

    // Locally the report page polls the shared JSON file, so the scan can finish after this response.
    // On Vercel each isolate has its own disk. Finish now and return the report; the browser holds it
    // for the report page when the next request lands on an isolate that never saw the write.
    if (process.env.VERCEL) {
      const report = await finish();
      return Response.json({ scanId, projectId: project.id, report });
    }

    after(() => finish());
    return Response.json({ scanId, projectId: project.id }, { status: 202 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't start the scan";
    console.error("[scan]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
