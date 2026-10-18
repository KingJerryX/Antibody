"use client";

import type { CheckTier, Finding, ScanCheck, ScanReport } from "@antibody/core";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { SEVERITY_ORDER } from "@/components/ui";
import { useHealth } from "@/components/useHealth";
import { usePoll } from "@/components/usePoll";
import { useSessionValue } from "@/components/useSessionValue";
import { unsavedReport } from "@/lib/unsaved-scans";

/** Signed-out scans have no project. Their next step is signing in, which saves the next scan. */
const SIGN_IN = "/api/auth/github?next=/sites";
import { LIVE_SKIP_PENALTY, liveChecksSkipped, securityScore } from "@/lib/score";

function joinAnd(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

/** Evidence is "Missing: A, B, C". The report turns that list into a sentence. */
function headerNames(f: Finding): string[] | null {
  if (f.kind !== "missing_security_headers") return null;
  const line = f.evidence
    .split("\n")
    .map((s) => s.trim())
    .find((s) => s.startsWith("Missing:"));
  if (!line) return [];
  return line
    .slice("Missing:".length)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function headline(findings: Finding[]) {
  const n = findings.length;
  if (n === 0) return "No issues found";
  const mild = findings.every((f) => f.severity === "low");
  if (n === 1) return mild ? "One improvement recommended" : "One issue to fix";
  return mild ? `${n} improvements recommended` : `${n} issues to fix`;
}

const HEADERS_LEDE =
  "The deployed app is missing browser protection headers. This finding is low severity, but addressing it closes avoidable gaps.";
const HEADERS_WHY =
  "These headers help browsers resist clickjacking and content sniffing. A suitable Content Security Policy adds another layer of protection.";
const HEADERS_FIX = "Set the response headers in Next.js, deploy, and scan again. Tailor the policy to your app's resources.";

/** Older scans stored the generic header copy. New scans already carry these sentences from the scanner. */
function headersLede(f: Finding) {
  return f.plainEnglish.startsWith("Your site isn't sending") ? HEADERS_LEDE : f.plainEnglish;
}

function lede(findings: Finding[]) {
  if (findings.length === 0) return "We didn't find any of the usual holes. The live shield still watches the app.";
  if (findings.length === 1 && findings[0].kind === "missing_security_headers") return headersLede(findings[0]);
  if (findings.length === 1) return findings[0].plainEnglish;
  return "Start with the highest severity. Each finding includes what we saw, why it matters, and a fix you can approve.";
}

function statusLine(findings: Finding[], s: number, surfaceOnly: boolean) {
  const n = findings.length;
  const base = (() => {
    if (n === 0) return "Overall status is strong. Every check we ran came back clean.";
    const onlyLow = findings.every((f) => f.severity === "low");
    if (s >= 85 && onlyLow && n === 1) return "Overall status is strong. One low severity finding remains.";
    if (s >= 85 && onlyLow) return `Overall status is strong. ${n} low severity findings remain.`;
    if (s >= 85) return `Overall status is strong. ${n} finding${n === 1 ? "" : "s"} still open.`;
    if (s >= 55) return `Needs work. ${n} finding${n === 1 ? "" : "s"} to address.`;
    return `At risk. ${n} finding${n === 1 ? "" : "s"} to address before this is safe to leave up.`;
  })();
  if (!surfaceOnly) return base;
  if (n === 0) return "Surface checks came back clean. Live API checks did not run, so this number is not a full review.";
  return `${base} Live API checks did not run.`;
}

function present(f: Finding) {
  const names = f.title === "Protective HTTP headers" ? headerNames(f) : null;
  if (names) {
    const list = joinAnd(names);
    return {
      title: "Protective HTTP headers",
      meta: names.length ? `${names.length} missing` : undefined,
      observed: names.length
        ? `${list} ${names.length === 1 ? "was" : "were"} absent from the live response.`
        : f.plainEnglish,
      why: f.impact.startsWith("Makes clickjacking") ? HEADERS_WHY : f.impact,
      fix: f.fixHint.startsWith("Add these response headers") ? HEADERS_FIX : f.fixHint,
    };
  }
  const file = f.location?.file && `${f.location.file}${f.location.line ? `:${f.location.line}` : ""}`;
  return {
    title: f.title,
    meta: file || undefined,
    observed: f.plainEnglish,
    why: f.impact,
    fix: f.fixHint,
  };
}

export function ReportView() {
  const { id } = useParams<{ id: string }>();
  // A signed-out scan lives only in this page's memory: no server copy to poll, and a refresh forgets it.
  const kept = unsavedReport<ScanReport>(id);
  const { data, error } = usePoll<ScanReport & { canFix?: boolean }>(kept ? null : `/api/scan/${id}`, 1500, (s) => s.status === "running");
  const health = useHealth();
  // Filled by the scan form on Vercel, where the next request may not see the file the scan wrote.
  const cached = useSessionValue<ScanReport>(`antibody-scan:${id}`);
  const scan = kept ?? data ?? cached;

  if (!scan) {
    const gone = error?.toLowerCase().includes("not found");
    return (
      <div className="ab">
        <div className="wrap page">
          <p className="sub">
            {gone
              ? "This scan wasn't saved because you weren't signed in, so it's gone after a refresh."
              : error
                ? `Couldn't load this report: ${error}`
                : "Loading report…"}
          </p>
          {gone && (
            <div className="actions">
              <Link className="btn btn-light" href="/#scan">Scan again</Link>
              <a className="btn btn-ghost" href={SIGN_IN}>Sign in with GitHub to keep scans</a>
            </div>
          )}
        </div>
      </div>
    );
  }

  const host = URL.parse(scan.targetUrl)?.host ?? scan.targetUrl;
  const findings = [...scan.findings].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));

  return (
    <div className="ab">
      <div className="wrap page view">
        <div className="report-top">
          <nav className="crumb" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden="true">/</span>
            <span>Report</span>
            <span className="host">{host}</span>
          </nav>
          {scan.projectId ? (
            <span className="report-links">
              <Link href={`/connect/${scan.projectId}`}>Set up alerts</Link>
              <Link href={`/live/${scan.projectId}`}>Live view</Link>
            </span>
          ) : (
            <span className="report-links">
              <a href={SIGN_IN}>Not saved: sign in to keep it</a>
            </span>
          )}
        </div>

        {scan.status === "running" ? (
          <Running host={host} />
        ) : scan.status === "error" ? (
          <Failed scan={scan} />
        ) : (
          <Done scan={scan} findings={findings} offline={health?.fixes === "offline"} canFix={data?.canFix === true} />
        )}
      </div>
    </div>
  );
}

function Running({ host }: { host: string }) {
  return (
    <div className="run" role="status" aria-live="polite">
      <h1 className="display">Scanning {host}</h1>
      <p>Checking for open databases, leaked keys, unprotected routes, and missing limits. Usually about 30 seconds.</p>
    </div>
  );
}

function Failed({ scan }: { scan: ScanReport }) {
  return (
    <div className="run">
      <h1 className="display">The scan didn&apos;t finish</h1>
      <p>{scan.error ?? "Unknown error"}</p>
      <div className="actions">
        <Link className="btn btn-light" href="/#scan">
          Try another scan
        </Link>
      </div>
    </div>
  );
}

const TIERS: [tier: CheckTier, label: string][] = [
  ["passive", "What any visitor can see"],
  ["live", "Live checks on your API"],
  ["code", "Your code on GitHub"],
];
const MARK: Record<ScanCheck["status"], string> = { pass: "✓", fail: "✗", not_run: "–" };

/** Honest summary: how many checks ran, which failed, and what connecting GitHub would add. No score. */
function ChecksCard({ checks, findings, projectId, canFix }: { checks: ScanCheck[]; findings: Finding[]; projectId: string; canFix: boolean }) {
  const ran = checks.filter((c) => c.status !== "not_run");
  const failed = checks.filter((c) => c.status === "fail");
  const waiting = checks.length - ran.length;
  const tone = failed.length === 0 ? "" : findings.some((f) => f.severity === "critical" || f.severity === "high") ? "bad" : "warn";
  return (
    <aside className="score-card" aria-label="Checks">
      <p className="kicker">Checks run</p>
      <p className={`figure ${tone}`}>
        {ran.length}
        <span className="figure-of">/{checks.length}</span>
      </p>
      <p className="status-line">
        {failed.length ? `${failed.length} failed.` : "None failed."}{" "}
        {waiting ? `${waiting} didn't run yet: they need you to connect GitHub and Vercel.` : "Every check ran."}
      </p>
      {waiting > 0 && (
        <Link className="btn btn-lime check-cta" href={!projectId ? SIGN_IN : canFix ? "/api/vercel/connect" : `/connect/${projectId}`}>
          {!projectId ? "Sign in with GitHub for the full check" : canFix ? "Connect Vercel for live checks" : "Connect GitHub for the full check"}
        </Link>
      )}
      <div className="score-rows">
        {TIERS.map(([tier, label]) => {
          const rows = checks.filter((c) => c.tier === tier);
          if (!rows.length) return null;
          const run = rows.filter((c) => c.status !== "not_run").length;
          return (
            <details key={tier} open={tier === "passive" || rows.some((c) => c.status === "fail")}>
              <summary>
                <span>{label}</span>
                <b>{run ? `${run}/${rows.length}` : "not run"}</b>
              </summary>
              <ul className="score-list">
                {rows.map((c) => (
                  <li key={c.id} className={`check-row ${c.status}`} title={c.note}>
                    <span aria-label={c.status.replace("_", " ")}>{MARK[c.status]}</span> {c.label}
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </div>
    </aside>
  );
}

function Done({ scan, findings, offline, canFix }: { scan: ScanReport; findings: Finding[]; offline: boolean; canFix: boolean }) {
  const surfaceOnly = liveChecksSkipped(scan.skipped);
  const s = securityScore(findings, scan.skipped);
  const tone = s >= 85 ? "" : s >= 55 ? "warn" : "bad";
  return (
    <div className="report">
      {scan.checks?.length ? (
        <ChecksCard checks={scan.checks} findings={findings} projectId={scan.projectId} canFix={canFix} />
      ) : (
      <aside className="score-card" aria-label="Security score">
        <p className="kicker">Security score</p>
        <p className={`figure ${tone}`}>{s}</p>
        <p className="status-line">{statusLine(findings, s, surfaceOnly)}</p>
        <div className="score-rows">
          <div className="row">
            <span>Open findings</span>
            <b>{findings.length}</b>
          </div>
          {surfaceOnly && (
            <div className="row">
              <span>Live checks not run</span>
              <b>−{LIVE_SKIP_PENALTY}</b>
            </div>
          )}
          <details>
            <summary>
              <span>Passed checks</span>
              <b>{scan.passed.length}</b>
            </summary>
            {scan.passed.length > 0 && (
              <ul className="score-list">
                {scan.passed.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </details>
          {(scan.skipped?.length ?? 0) > 0 && (
            <details>
              <summary>
                <span>Not run</span>
                <b>{scan.skipped!.length}</b>
              </summary>
              <ul className="score-list">
                {scan.skipped!.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </aside>
      )}

      <section className="scan-summary" aria-labelledby="scan-summary">
        <p className="kicker">Scan summary</p>
        <h1 id="scan-summary">{headline(findings)}</h1>
        <p className="lede">{lede(findings)}</p>
        {findings.map((f) => (
          <FindingBlock key={f.id} finding={f} offline={offline} canFix={canFix} hideObserved={findings.length === 1 && f.plainEnglish === lede(findings)} />
        ))}
      </section>
    </div>
  );
}

function FindingBlock({ finding: f, offline, canFix, hideObserved }: { finding: Finding; offline: boolean; canFix: boolean; hideObserved: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showEvidence, setShowEvidence] = useState(false);
  const view = present(f);
  const sameAsLede = hideObserved && view.observed === f.plainEnglish;

  async function fix() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/fixes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ findingId: f.id, finding: f }),
      });
      const text = await res.text();
      let data: { error?: string; id?: string } = {};
      try {
        data = text ? (JSON.parse(text) as { error?: string; id?: string }) : {};
      } catch {
        throw new Error("Couldn't start the fix");
      }
      if (!res.ok || !data.id) throw new Error(data.error ?? "Couldn't start the fix");
      sessionStorage.setItem(`antibody-fix:${data.id}`, text);
      router.push(`/fix/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the fix");
      setBusy(false);
    }
  }

  return (
    <article className="finding-block">
      <div className="finding-row">
        <span className={`sev-pill ${f.severity}`}>{f.severity}</span>
        <h2>{view.title}</h2>
        {view.meta && <span className="meta">{view.meta}</span>}
      </div>
      {!sameAsLede && (
        <div className="brief">
          <h3>What we observed</h3>
          <p>{view.observed}</p>
        </div>
      )}
      <div className="brief">
        <h3>Why it matters</h3>
        <p>{view.why}</p>
      </div>
      <div className="brief">
        <h3>Recommended fix</h3>
        <p>{view.fix}</p>
      </div>
      <div className="report-actions">
        {f.evidence && (
          <button type="button" className="btn btn-ghost" aria-expanded={showEvidence} onClick={() => setShowEvidence((v) => !v)}>
            {showEvidence ? "Hide evidence" : "View evidence"}
          </button>
        )}
        {canFix ? (
          <button
            type="button"
            className={offline ? "btn btn-offline" : "btn btn-lime"}
            onClick={fix}
            disabled={busy || offline}
            title={offline ? 'Start it with "npm run dev:orchestrator"' : undefined}
          >
            {busy ? "Starting…" : offline ? "Automatic fix offline" : "Fix it"}
          </button>
        ) : (
          // No connected repo means no code to patch, so there is no fix to offer yet.
          <Link className="btn btn-lime" href={f.projectId ? `/connect/${f.projectId}` : SIGN_IN} title="Antibody only fixes code it can see">
            {f.projectId ? "Connect GitHub to fix" : "Sign in with GitHub to fix"}
          </Link>
        )}
      </div>
      {showEvidence && <pre className="evidence">{f.evidence}</pre>}
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
    </article>
  );
}
