"use client";

import type { Finding, ScanReport, Severity } from "@antibody/core";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SEVERITY_ORDER } from "@/components/ui";
import { usePoll } from "@/components/usePoll";

const WEIGHT: Record<Severity, number> = { critical: 35, high: 20, medium: 8, low: 3 };

type Health = { orchestrator: "up" | "down" };

function scoreOf(findings: Finding[]) {
  return Math.max(0, 100 - findings.reduce((n, f) => n + WEIGHT[f.severity], 0));
}

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

function statusLine(findings: Finding[], s: number) {
  const n = findings.length;
  if (n === 0) return "Overall status is strong. Every check we ran came back clean.";
  const onlyLow = findings.every((f) => f.severity === "low");
  if (s >= 85 && onlyLow && n === 1) return "Overall status is strong. One low severity finding remains.";
  if (s >= 85 && onlyLow) return `Overall status is strong. ${n} low severity findings remain.`;
  if (s >= 85) return `Overall status is strong. ${n} finding${n === 1 ? "" : "s"} still open.`;
  if (s >= 55) return `Needs work. ${n} finding${n === 1 ? "" : "s"} to address.`;
  return `At risk. ${n} finding${n === 1 ? "" : "s"} to address before this is safe to leave up.`;
}

function present(f: Finding) {
  const names = headerNames(f);
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
  const { data, error } = usePoll<ScanReport>(`/api/scan/${id}`, 1500, (s) => s.status === "running");
  const { data: health } = usePoll<Health>("/api/health", 10_000);
  const [fallback, setFallback] = useState<ScanReport>();
  const [checked, setChecked] = useState(false);

  // Filled by the scan form on Vercel, where the next request may not see the file the scan wrote.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`antibody-scan:${id}`);
      if (raw) setFallback(JSON.parse(raw) as ScanReport);
    } catch {
      /* a bad cache just means we wait on the poll */
    }
    setChecked(true);
  }, [id]);

  const scan = data ?? fallback;

  if (!scan) {
    return (
      <div className="ab">
        <div className="wrap page">
          <p className="sub">{checked && error ? `Couldn't load this report: ${error}` : "Loading report…"}</p>
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
          <span className="report-links">
            <Link href={`/connect/${scan.projectId}`}>Set up alerts</Link>
            <Link href={`/live/${scan.projectId}`}>Live view</Link>
          </span>
        </div>

        {scan.status === "running" ? (
          <Running host={host} />
        ) : scan.status === "error" ? (
          <Failed scan={scan} />
        ) : (
          <Done scan={scan} findings={findings} offline={health?.orchestrator === "down"} />
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

function Done({ scan, findings, offline }: { scan: ScanReport; findings: Finding[]; offline: boolean }) {
  const s = scoreOf(findings);
  const tone = s >= 85 ? "" : s >= 55 ? "warn" : "bad";
  return (
    <div className="report">
      <aside className="score-card" aria-label="Security score">
        <p className="kicker">Security score</p>
        <p className={`figure ${tone}`}>{s}</p>
        <p className="status-line">{statusLine(findings, s)}</p>
        <div className="score-rows">
          <div className="row">
            <span>Open findings</span>
            <b>{findings.length}</b>
          </div>
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

      <section className="scan-summary" aria-labelledby="scan-summary">
        <p className="kicker">Scan summary</p>
        <h1 id="scan-summary">{headline(findings)}</h1>
        <p className="lede">{lede(findings)}</p>
        {findings.map((f) => (
          <FindingBlock key={f.id} finding={f} offline={offline} hideObserved={findings.length === 1 && f.plainEnglish === lede(findings)} />
        ))}
      </section>
    </div>
  );
}

function FindingBlock({ finding: f, offline, hideObserved }: { finding: Finding; offline: boolean; hideObserved: boolean }) {
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
        <button
          type="button"
          className={offline ? "btn btn-offline" : "btn btn-lime"}
          onClick={fix}
          disabled={busy || offline}
          title={offline ? 'Start it with "npm run dev:orchestrator"' : undefined}
        >
          {busy ? "Starting…" : offline ? "Automatic fix offline" : "Fix it"}
        </button>
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
