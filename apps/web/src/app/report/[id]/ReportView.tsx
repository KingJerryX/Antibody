"use client";

import type { Finding, ScanReport, Severity } from "@antibody/core";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Card, Icon, SEVERITY_ORDER, SEVERITY_STYLE, SeverityPill } from "@/components/ui";
import { usePoll } from "@/components/usePoll";

const WEIGHT: Record<Severity, number> = { critical: 35, high: 20, medium: 8, low: 3 };

function score(findings: Finding[]) {
  return Math.max(0, 100 - findings.reduce((n, f) => n + WEIGHT[f.severity], 0));
}

function verdict(s: number) {
  if (s >= 85) return { label: "Looking good", color: "text-mint", stroke: "#5cf2b0" };
  if (s >= 55) return { label: "Needs work", color: "text-amber-200", stroke: "#fbbf24" };
  return { label: "At risk", color: "text-red-300", stroke: "#ef4444" };
}

export function ReportView() {
  const { id } = useParams<{ id: string }>();
  const { data: scan, error } = usePoll<ScanReport>(`/api/scan/${id}`, 1500, (s) => s.status === "running");

  if (!scan) {
    return (
      <div className="mx-auto max-w-5xl px-5 py-16">
        <p className="text-slate-400">{error ? `Couldn't load this report: ${error}` : "Loading report…"}</p>
      </div>
    );
  }

  const host = URL.parse(scan.targetUrl)?.host ?? scan.targetUrl;

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <div className="mb-2 flex flex-wrap items-center gap-3 text-sm text-slate-400">
        <span>Security report</span>
        <span aria-hidden="true">/</span>
        <span className="font-mono text-slate-300">{host}</span>
        <Link href={`/connect/${scan.projectId}`} className="ml-auto inline-flex items-center gap-1 text-mint hover:underline">
          Set up alerts <Icon name="arrow" className="h-3.5 w-3.5" />
        </Link>
        <Link href={`/live/${scan.projectId}`} className="inline-flex items-center gap-1 text-mint hover:underline">
          Live view <Icon name="arrow" className="h-3.5 w-3.5" />
        </Link>
      </div>

      {scan.status === "running" ? <Running host={host} /> : scan.status === "error" ? <Failed scan={scan} /> : <Summary scan={scan} />}

      {scan.status === "done" && (
        <>
          {SEVERITY_ORDER.map((sev) => {
            const group = scan.findings.filter((f) => f.severity === sev);
            if (!group.length) return null;
            return (
              <section key={sev} aria-labelledby={`sev-${sev}`} className="mt-10">
                <h2 id={`sev-${sev}`} className={`mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest ${SEVERITY_STYLE[sev].text}`}>
                  {sev} <span className="text-slate-500">({group.length})</span>
                </h2>
                <ul className="space-y-4">
                  {group.map((f) => (
                    <li key={f.id}>
                      <FindingCard finding={f} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {scan.passed.length > 0 && (
            <section aria-labelledby="passed" className="mt-10">
              <h2 id="passed" className="mb-4 text-sm font-semibold uppercase tracking-widest text-mint">
                Passed <span className="text-slate-500">({scan.passed.length})</span>
              </h2>
              <Card className="p-5">
                <ul className="grid gap-2 sm:grid-cols-2">
                  {scan.passed.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-sm text-slate-300">
                      <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-mint" />
                      {p}
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Running({ host }: { host: string }) {
  return (
    <Card className="mt-4 flex items-center gap-5 p-8">
      <span className="relative flex h-12 w-12 shrink-0 items-center justify-center" aria-hidden="true">
        <span className="absolute inset-0 animate-ping rounded-full bg-mint/20" />
        <Icon name="search" className="h-7 w-7 text-mint" />
      </span>
      <div role="status" aria-live="polite">
        <h1 className="text-2xl font-semibold text-white">Scanning {host}…</h1>
        <p className="mt-1 text-slate-400">Checking for open databases, leaked keys, unprotected routes and missing limits. Usually about 30 seconds.</p>
      </div>
    </Card>
  );
}

function Failed({ scan }: { scan: ScanReport }) {
  return (
    <Card className="mt-4 border-red-500/40 p-8">
      <h1 className="text-2xl font-semibold text-white">The scan didn&apos;t finish</h1>
      <p className="mt-2 text-red-200">{scan.error ?? "Unknown error"}</p>
      <Link href="/#scan" className="mt-4 inline-block text-mint hover:underline">Try another scan</Link>
    </Card>
  );
}

function Summary({ scan }: { scan: ScanReport }) {
  const s = score(scan.findings);
  const v = verdict(s);
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <Card className="animate-rise mt-4 grid gap-8 p-8 sm:grid-cols-[auto_1fr] sm:items-center">
      <div className="relative mx-auto h-36 w-36">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="60" cy="60" r={r} fill="none" stroke="#1f2630" strokeWidth="10" />
          <circle cx="60" cy="60" r={r} fill="none" stroke={v.stroke} strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - s / 100)} className="ring-fill" style={{ "--ring-empty": c } as React.CSSProperties} />
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="text-4xl font-semibold tracking-tight tabular-nums text-white">{s}</div>
            <div className="text-xs text-slate-400">out of 100</div>
          </div>
        </div>
      </div>
      <div>
        <h1 className={`text-3xl font-semibold tracking-tight ${v.color}`}>{v.label}</h1>
        <p className="mt-2 text-slate-300">
          {scan.findings.length === 0
            ? "We didn't find any of the usual holes. The live shield still has your back."
            : `We found ${scan.findings.length} issue${scan.findings.length === 1 ? "" : "s"}. Start at the top: each one has a one-click fix.`}
        </p>
        <dl className="mt-5 flex flex-wrap gap-3">
          {SEVERITY_ORDER.map((sev) => (
            <div key={sev} className="rounded-xl border border-line px-4 py-2">
              <dt className={`text-xs uppercase tracking-wide ${SEVERITY_STYLE[sev].text}`}>{sev}</dt>
              <dd className="text-2xl font-semibold tabular-nums text-white">{scan.findings.filter((f) => f.severity === sev).length}</dd>
            </div>
          ))}
          <div className="rounded-xl border border-line px-4 py-2">
            <dt className="text-xs uppercase tracking-wide text-mint">passed</dt>
            <dd className="text-2xl font-semibold tabular-nums text-white">{scan.passed.length}</dd>
          </div>
        </dl>
      </div>
    </Card>
  );
}

function FindingCard({ finding: f }: { finding: Finding }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function fix() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/fixes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ findingId: f.id }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't start the fix");
      router.push(`/fix/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the fix");
      setBusy(false);
    }
  }

  const file = f.location?.file && `${f.location.file}${f.location.line ? `:${f.location.line}` : ""}`;
  const where = [f.detectedBy === "code_audit" ? undefined : f.location?.url, file].filter(Boolean).join(" · ");
  // Live probes prove a hole; Semgrep only shows where it is in the code.
  const proof =
    f.detectedBy === "code_audit"
      ? { label: "Found in code", style: "border-slate-500/40 text-slate-300" }
      : { label: file ? "Proven live · found in code" : "Proven on your live app", style: "border-mint/50 text-mint" };

  return (
    <Card className="relative overflow-hidden p-6">
      <span className={`absolute inset-y-0 left-0 w-1 ${SEVERITY_STYLE[f.severity].bar}`} aria-hidden="true" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityPill severity={f.severity} />
            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${proof.style}`}>{proof.label}</span>
            {where && <span className="truncate font-mono text-xs text-slate-500">{where}</span>}
          </div>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-white">{f.title}</h3>
        </div>
        <button
          onClick={fix}
          disabled={busy}
          className="press inline-flex shrink-0 items-center gap-2 rounded-lg bg-mint px-4 py-2 text-sm font-semibold text-ink hover:brightness-110 disabled:opacity-60"
        >
          <Icon name="wrench" className="h-4 w-4" />
          {busy ? "Starting…" : "Fix it"}
        </button>
      </div>
      <p className="mt-3 text-slate-200">{f.plainEnglish}</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">What an attacker could do</h4>
          <p className="mt-1 text-sm text-slate-300">{f.impact}</p>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">How to fix</h4>
          <p className="mt-1 text-sm text-slate-300">{f.fixHint}</p>
        </div>
      </div>
      {f.evidence && (
        <div className="mt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Evidence (secrets redacted)</h4>
          <pre className="mt-1 overflow-x-auto rounded-lg border border-line bg-black/40 p-3 font-mono text-xs leading-relaxed text-slate-300">{f.evidence}</pre>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}
    </Card>
  );
}
