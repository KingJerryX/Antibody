"use client";

import type { CheckTier, Finding, ScanCheck, ScanReport, Severity } from "@antibody/core";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence, motion, type HTMLMotionProps } from "motion/react";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { SEVERITY_ORDER } from "@/components/ui";
import { useHealth } from "@/components/useHealth";
import { usePoll } from "@/components/usePoll";
import { useSessionValue } from "@/components/useSessionValue";
import { unsavedReport } from "@/lib/unsaved-scans";
import { Rings, ScanProgress } from "./ScanRings";

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
  return "Highest severity first. Open an issue to see what we found and how to fix it.";
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

type OpenFix = { id: string; status: string };
/** The latest fix per finding (from GET /api/scan/[id]), so a finding links to its fix instead of starting another. */
const OpenFixes = createContext<Record<string, OpenFix>>({});
const FIX_LABEL: Record<string, string> = { drafting: "View fix (Droid is writing it)", ready: "Review the fix", approved: "View fix (approved)", merged: "View fix (merged)" };

export function ReportView() {
  const { id } = useParams<{ id: string }>();
  // A signed-out scan lives only in this page's memory: no server copy to poll, and a refresh forgets it.
  const kept = unsavedReport<ScanReport>(id);
  const { data, error } = usePoll<ScanReport & { canFix?: boolean; fixes?: Record<string, OpenFix> }>(kept ? null : `/api/scan/${id}`, 1500, (s) => s.status === "running");
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

        <OpenFixes.Provider value={data?.fixes ?? {}}>
          <ScanStage scan={scan} host={host} findings={findings} offline={health?.fixes === "offline"} canFix={data?.canFix === true} />
        </OpenFixes.Provider>
      </div>
    </div>
  );
}

const PLAYED = (id: string) => `antibody-scan-played:${id}`;
/** A report opened within this long of its scan finishing still plays the progress; older reports open on the results. */
const RECENT_MS = 3 * 60_000;

/** Plays the progress for a scan that is running or just finished (once per tab), otherwise opens on the results. */
function shouldPlay(scan: ScanReport) {
  if (scan.status === "running") return true;
  try {
    if (sessionStorage.getItem(PLAYED(scan.id))) return false;
  } catch {
    /* no storage: fall through to the age check */
  }
  const finished = Date.parse(scan.finishedAt ?? "");
  return Number.isFinite(finished) && Date.now() - finished < RECENT_MS;
}

function ScanStage({ scan, host, findings, offline, canFix }: { scan: ScanReport; host: string; findings: Finding[]; offline: boolean; canFix: boolean }) {
  const [revealed, setRevealed] = useState(() => !shouldPlay(scan));

  // Whether this view played the progress: then the rings arrive full and the summary follows them in.
  const [entered] = useState(() => !revealed);

  function reveal() {
    try {
      sessionStorage.setItem(PLAYED(scan.id), "1");
    } catch {
      /* it just plays again next time */
    }
    setRevealed(true);
  }

  if (!revealed || scan.status === "running") {
    return <ScanProgress host={host} done={scan.status !== "running"} color={LIME} labels={scan.checks?.map((c) => c.label)} onFinished={reveal} />;
  }
  if (scan.status === "error") return <Failed scan={scan} />;
  return (
    <Entered.Provider value={entered}>
      <Done scan={scan} findings={findings} offline={offline} canFix={canFix} />
    </Entered.Provider>
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
const LIME = "#7fee64";

/** True when the results just replaced the progress view, so they animate in after the rings land. */
const Entered = createContext(false);

/** Rises into place after the rings settle; static when the report opened directly. */
function Reveal({ order, ...props }: HTMLMotionProps<"div"> & { order: number }) {
  const entered = useContext(Entered);
  return <motion.div initial={entered ? { opacity: 0, y: 18 } : false} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 140, damping: 22, delay: 0.35 + order * 0.09 }} {...props} />;
}
const MARK: Record<ScanCheck["status"], string> = { pass: "✓", fail: "✗", not_run: "–" };

function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/** Ring, headline and a legend: how many of the checks that ran passed, per tier. No score; waiting checks stay out of the total. */
function ChecksHero({ checks, findings, projectId, canFix }: { checks: ScanCheck[]; findings: Finding[]; projectId: string; canFix: boolean }) {
  const passed = checks.filter((c) => c.status === "pass").length;
  const failed = checks.filter((c) => c.status === "fail").length;
  const waiting = checks.filter((c) => c.status === "not_run").length;
  const ran = passed + failed;
  const tiers = TIERS.map(([tier, label]) => {
    const rows = checks.filter((c) => c.tier === tier);
    const ok = rows.filter((c) => c.status === "pass").length;
    return { tier, label, rows, ok, ran: rows.filter((c) => c.status !== "not_run").length };
  });
  const rings = [{ color: LIME, value: ran ? passed / ran : 0 }];
  // Say exactly what's missing: signing in alone doesn't give repo access.
  const missing = (tier: CheckTier) => checks.some((c) => c.tier === tier && c.status === "not_run");
  const entered = useContext(Entered);
  return (
    <>
      <section className="scan-hero" aria-labelledby="scan-summary">
        <div className="scan-hero-rings">
          <Rings rings={rings} size={216} from={entered ? 1 : 0}>
            <b className="rings-count">
              {passed}
              {ran > 0 && <small>/{ran}</small>}
            </b>
            <span className="rings-caption">checks passed</span>
          </Rings>
        </div>
        <Reveal order={0} className="scan-hero-text">
          <p className="kicker">Scan summary</p>
          <h1 id="scan-summary">{headline(findings)}</h1>
          <p className="lede">
            {failed ? `${failed} check${failed === 1 ? "" : "s"} failed.` : "No check failed."} {waiting ? `${waiting} didn't run yet.` : "Every check ran."}
          </p>
          <ul className="ring-legend">
            {tiers
              .filter((t) => t.rows.length)
              .map((t) => (
                <li key={t.tier}>
                  <span>{t.label}</span>
                  <span className="tier-bar" aria-hidden="true">
                    <motion.i initial={{ scaleX: 0 }} animate={{ scaleX: t.ran ? t.ok / t.ran : 0 }} transition={{ type: "spring", stiffness: 70, damping: 18, delay: entered ? 0.6 : 0.1 }} />
                  </span>
                  <b>{t.ran ? `${t.ok}/${t.ran}` : "not run"}</b>
                </li>
              ))}
          </ul>
        </Reveal>
      </section>

      {waiting > 0 && (
        <Reveal order={1}>
          <UnlockCard waiting={waiting} projectId={projectId} canFix={canFix} needsCode={missing("code")} />
        </Reveal>
      )}

      <Reveal order={2}>
        <details className="all-checks">
        <summary>See all {checks.length} checks</summary>
        <div className="all-checks-grid">
          {tiers
            .filter((t) => t.rows.length)
            .map((t) => (
              <div key={t.tier}>
                <h3>{t.label}</h3>
                <ul className="score-list">
                  {t.rows.map((c) => (
                    <li key={c.id} className={`check-row ${c.status}`} title={c.note}>
                      <span aria-label={c.status.replace("_", " ")}>{MARK[c.status]}</span> {c.label}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
        </details>
      </Reveal>
    </>
  );
}

/** The one next step that unlocks the checks that didn't run, set apart from the issues. */
function UnlockCard({ waiting, projectId, canFix, needsCode }: { waiting: number; projectId: string; canFix: boolean; needsCode: boolean }) {
  const step = !projectId
    ? { href: SIGN_IN, label: "Sign in with GitHub", why: "Save this site to your account and run every check on it.", github: true }
    : needsCode && !canFix
      ? { href: `/connect/${projectId}`, label: "Install Antibody on GitHub", why: "Antibody reads your repo, runs the code checks, and opens fix pull requests that you approve.", github: true }
      : { href: "/api/vercel/connect", label: "Connect Vercel", why: "Run the live checks against the API that hosts this site.", github: false };
  return (
    <aside className="unlock" aria-label="Unlock the remaining checks">
      <span className="unlock-count">+{waiting}</span>
      <div className="unlock-text">
        <h2>
          {waiting} more check{waiting === 1 ? "" : "s"} waiting
        </h2>
        <p>{step.why}</p>
      </div>
      <a className="btn btn-install" href={step.href}>
        {step.github && <GitHubMark />}
        {step.label}
        <span aria-hidden="true">→</span>
      </a>
    </aside>
  );
}

/** Older scans have no check list, so they keep the severity-weighted score, drawn as a single ring. */
function ScoreHero({ scan, findings }: { scan: ScanReport; findings: Finding[] }) {
  const surfaceOnly = liveChecksSkipped(scan.skipped);
  const s = securityScore(findings, scan.skipped);
  const color = s >= 85 ? "#7fee64" : s >= 55 ? "#ffb15a" : "#ff6d6d";
  const entered = useContext(Entered);
  return (
    <section className="scan-hero" aria-labelledby="scan-summary">
      <div className="scan-hero-rings">
        <Rings rings={[{ color, value: s / 100 }]} size={216} from={entered ? 1 : 0}>
          <b className="rings-count">{s}</b>
          <span className="rings-caption">security score</span>
        </Rings>
      </div>
      <Reveal order={0} className="scan-hero-text">
        <p className="kicker">Scan summary</p>
        <h1 id="scan-summary">{headline(findings)}</h1>
        <p className="lede">{statusLine(findings, s, surfaceOnly)}</p>
        {surfaceOnly && <p className="lede">Live checks not run: −{LIVE_SKIP_PENALTY}.</p>}
      </Reveal>
    </section>
  );
}

function Done({ scan, findings, offline, canFix }: { scan: ScanReport; findings: Finding[]; offline: boolean; canFix: boolean }) {
  return (
    <div className="report-stack">
      {scan.checks?.length ? <ChecksHero checks={scan.checks} findings={findings} projectId={scan.projectId} canFix={canFix} /> : <ScoreHero scan={scan} findings={findings} />}
      {findings.length > 0 && (
        <Reveal order={3}>
          <section className="issues" aria-labelledby="issues-title">
          <div className="issues-head">
            <h2 id="issues-title">Issues</h2>
            <p className="lede">{lede(findings)}</p>
          </div>
          {findings.length > 1 ? (
            <IssueBoard findings={findings} offline={offline} canFix={canFix} />
          ) : (
            <FindingBlock finding={findings[0]} offline={offline} canFix={canFix} hideObserved={findings[0].plainEnglish === lede(findings)} />
          )}
          </section>
        </Reveal>
      )}
    </div>
  );
}

/** Several findings: a short index and one open write-up, so the page does not grow with the list. */
function IssueBoard({ findings, offline, canFix }: { findings: Finding[]; offline: boolean; canFix: boolean }) {
  const [filter, setFilter] = useState<"all" | Severity>("all");
  const [selectedId, setSelectedId] = useState(findings[0]?.id ?? "");
  const listRef = useRef<HTMLUListElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<string | null>(null);

  const counts = useMemo(() => {
    const c = { all: findings.length, critical: 0, high: 0, medium: 0, low: 0 };
    for (const f of findings) c[f.severity] += 1;
    return c;
  }, [findings]);

  const visible = filter === "all" ? findings : findings.filter((f) => f.severity === filter);
  const selected = visible.find((f) => f.id === selectedId) ?? visible[0];
  const filters = (["all", ...SEVERITY_ORDER] as const).filter((key) => key === "all" || counts[key] > 0);

  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>("[aria-selected='true']");
    if (!list || !el) return;
    const listRect = list.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    if (elRect.top < listRect.top) list.scrollTop -= listRect.top - elRect.top;
    else if (elRect.bottom > listRect.bottom) list.scrollTop += elRect.bottom - listRect.bottom;
  }, [selected?.id, filter]);

  useEffect(() => {
    detailRef.current?.scrollTo({ top: 0 });
    const focusId = pendingFocus.current;
    pendingFocus.current = null;
    if (focusId && focusId === selected?.id) document.getElementById(`issue-opt-${focusId}`)?.focus();
  }, [selected?.id]);

  function move(to: number) {
    const next = visible[to];
    if (!next) return;
    pendingFocus.current = next.id;
    setSelectedId(next.id);
  }

  function onListKeyDown(e: React.KeyboardEvent) {
    if (!selected) return;
    const i = visible.findIndex((f) => f.id === selected.id);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(Math.min(visible.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(Math.max(0, i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      move(0);
    } else if (e.key === "End") {
      e.preventDefault();
      move(visible.length - 1);
    }
  }

  const place = selected ? visible.findIndex((f) => f.id === selected.id) + 1 : 0;

  return (
    <div className="issue-board">
      {filters.length > 2 && (
        <div className="sev-filters" role="group" aria-label="Filter issues by severity">
          {filters.map((key) => (
            <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {key === "all" ? "All" : key}
              <span className="count">{counts[key]}</span>
            </button>
          ))}
        </div>
      )}
      <div className="issue-split">
        <ul ref={listRef} className="issue-index" role="listbox" aria-label="Issues" onKeyDown={onListKeyDown}>
          {visible.map((f, i) => {
            const view = present(f);
            const on = f.id === selected?.id;
            return (
              <li key={f.id} role="presentation">
                <button
                  type="button"
                  className={f.severity}
                  id={`issue-opt-${f.id}`}
                  role="option"
                  aria-selected={on}
                  aria-posinset={i + 1}
                  aria-setsize={visible.length}
                  aria-label={`${f.severity}, ${view.title}`}
                  tabIndex={on ? 0 : -1}
                  onClick={() => setSelectedId(f.id)}
                >
                  <span className={`sev-pill ${f.severity}`}>{f.severity}</span>
                  <span className="issue-name">{view.title}</span>
                  {view.meta && <span className="issue-blurb">{view.meta}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        {selected && (
          <div ref={detailRef} className={`issue-detail ${selected.severity}`} role="region" aria-label={present(selected).title}>
            {/* popLayout lifts the outgoing issue out of the flow, so the next one slides in with no blank frame. */}
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div key={selected.id} initial={{ opacity: 0.4, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12, transition: { duration: 0.08 } }} transition={{ type: "spring", stiffness: 380, damping: 32 }}>
                <p className="issue-pos">
                  {place} of {visible.length}
                </p>
                <FindingBlock finding={selected} offline={offline} canFix={canFix} hideObserved={false} />
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

function FindingBlock({ finding: f, offline, canFix, hideObserved }: { finding: Finding; offline: boolean; canFix: boolean; hideObserved: boolean }) {
  const openFix = useContext(OpenFixes)[f.id];
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
        {openFix ? (
          <Link className="btn btn-lime" href={`/fix/${openFix.id}`}>
            {FIX_LABEL[openFix.status] ?? "View fix"}
          </Link>
        ) : canFix ? (
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
          <a className="btn btn-install" href={f.projectId ? `/connect/${f.projectId}` : SIGN_IN} title="Antibody only fixes code it can see">
            <GitHubMark />
            {f.projectId ? "Install on GitHub to fix" : "Sign in with GitHub to fix"}
          </a>
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
