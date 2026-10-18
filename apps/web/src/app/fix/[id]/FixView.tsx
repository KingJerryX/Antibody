"use client";

import type { ExploitReplay, FixCheck, FixCheckName, FixProposal, ReplayedResponse } from "@antibody/core";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { usePoll } from "@/components/usePoll";
import { useSessionValue } from "@/components/useSessionValue";
import { parseDiff } from "@/lib/diff";

const CHECK_LABEL: Record<FixCheckName, { title: string; sub: string }> = {
  exploit_test: { title: "The attack no longer works", sub: "Exploit test" },
  behavior_tests: { title: "Your app still behaves the same", sub: "Behavior tests" },
  preview_replay: { title: "Real traffic replayed on a preview", sub: "Preview replay" },
  second_review: { title: "A second reviewer agrees", sub: "Second review" },
};
const CHECK_ORDER = Object.keys(CHECK_LABEL) as FixCheckName[];

type CheckState = FixCheck["status"] | "waiting";

const CHECK_TEXT: Record<CheckState, string> = {
  pass: "Passed",
  fail: "Failed",
  pending: "Running",
  waiting: "Waiting",
  skipped: "Skipped",
};

/** What the owner's decision means, shown once the fix has left review. */
const DECIDED_NOTE: Partial<Record<FixProposal["status"], string>> = {
  approved: "You approved it. Merging happens in GitHub, so it can always be rolled back.",
  merged: "Merged in GitHub.",
  rejected: "You rejected it. Nothing changed in your code.",
  rolled_back: "Rolled back in GitHub.",
};

const STATUS_LABEL: Record<FixProposal["status"], string> = {
  drafting: "Drafting",
  ready: "Ready for review",
  rejected: "Rejected",
  approved: "Approved",
  merged: "Merged",
  rolled_back: "Rolled back",
};

/** Where a fix is in its life: Droid writing it, Antibody attacking the patched copy, or finished. */
type Phase = "writing" | "verifying" | "done";

const phaseOf = (fix: FixProposal): Phase => (fix.status !== "drafting" ? "done" : fix.diff ? "verifying" : "writing");

const PHASE_NOTE: Record<Phase, string> = {
  writing: "Droid is writing the fix on a private copy of your app.",
  verifying: "Antibody is attacking the patched copy to prove the hole is closed.",
  done: "Plain English first. The code is below if you want it.",
};

/** Skipped checks don't count either way; everything else must pass. */
function verdict(fix: FixProposal, checks: FixCheck[], phase: Phase) {
  const counted = checks.filter((c) => c.status !== "skipped");
  const passed = counted.filter((c) => c.status === "pass").length;
  const failed = counted.length - passed - counted.filter((c) => c.status === "pending").length;
  const figure = phase === "writing" ? "–" : `${passed}/${counted.length}`;
  if (phase !== "done") return { figure, tone: "", line: PHASE_NOTE[phase] };
  if (fix.status !== "ready") return { figure, tone: failed ? "bad" : "ok", line: DECIDED_NOTE[fix.status] ?? STATUS_LABEL[fix.status] };
  if (failed) return { figure, tone: "bad", line: `${failed} check${failed === 1 ? "" : "s"} failed. Ask for changes or reject it.` };
  return { figure, tone: "ok", line: "Every check passed. Approve it when the change reads right to you." };
}

export function FixView() {
  const { id } = useParams<{ id: string }>();
  const { data, error, setData, refresh } = usePoll<FixProposal & { scanId?: string }>(
    `/api/fixes/${id}`,
    2000,
    // Also keep polling while a just-approved fix waits for its pull request.
    (f) =>
      f.status === "drafting" ||
      f.checks.some((c) => c.status === "pending") ||
      (f.status === "approved" && !f.prUrl && (!f.prNote || f.prNote.startsWith("Opening"))),
  );
  // Written by Fix it on Vercel, where the next request may not see the file this one wrote.
  const cached = useSessionValue<FixProposal & { scanId?: string }>(`antibody-fix:${id}`);
  const fix = data ?? cached;
  useEffect(() => {
    if (fix) sessionStorage.setItem(`antibody-fix:${id}`, JSON.stringify(fix));
  }, [fix, id]);

  if (!fix) {
    return (
      <div className="ab">
        <div className="wrap page">
          <p className="sub">{error ? `Couldn't load this fix: ${error}` : "Loading fix…"}</p>
        </div>
      </div>
    );
  }

  const phase = phaseOf(fix);
  const checks = CHECK_ORDER.map((name) => fix.checks.find((c) => c.name === name) ?? { name, status: "pending" as const, detail: "" });
  const replay = fix.checks.find((c) => c.name === "exploit_test")?.replay;
  const result = verdict(fix, checks, phase);

  return (
    <div className="ab">
      <div className="wrap page view">
        <div className="report-top">
          <nav className="crumb" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden="true">/</span>
            {fix.scanId && (
              <>
                <Link href={`/report/${fix.scanId}`}>Report</Link>
                <span aria-hidden="true">/</span>
              </>
            )}
            <span>Fix</span>
          </nav>
          <span className="report-links">
            {fix.scanId && <Link href={`/report/${fix.scanId}`}>Back to the report</Link>}
            <Link href={`/live/${fix.projectId}`}>Live view</Link>
          </span>
        </div>

        <div className="report">
          <aside className="score-card" aria-label="Fix status">
            <p className="kicker">Checks passed</p>
            <p className={`figure ${result.tone}`}>{result.figure}</p>
            <p className="status-line" aria-live="polite">{result.line}</p>
            <div className="score-rows">
              <div className="row">
                <span>Status</span>
                <b>{STATUS_LABEL[fix.status]}</b>
              </div>
              <div className="row">
                <span>Written by</span>
                <b>{fix.author === "droid" ? "Factory Droid" : "Mock fixer"}</b>
              </div>
              <div className="row">
                <span>Confidence</span>
                <b className="cap">{phase === "writing" ? "–" : fix.confidence}</b>
              </div>
              <div className="row">
                <span>Lines changed</span>
                <b>
                  {fix.linesChanged} in {fix.filesChanged.length} file{fix.filesChanged.length === 1 ? "" : "s"}
                </b>
              </div>
            </div>
          </aside>

          <section className="scan-summary" aria-labelledby="fix-title">
            <p className="kicker">Proposed fix</p>
            <h1 id="fix-title">Review this fix</h1>
            <p className="lede">{PHASE_NOTE[phase]}</p>
            {fix.author === "mock" && <p className="alert">Mock fixer: no Factory key is set, so this is a canned demo fix and nothing was run.</p>}

            <div className="brief">
              <h3>What was wrong</h3>
              <p>{fix.summary.whatWasWrong}</p>
            </div>
            <div className="brief">
              <h3>What changes</h3>
              <p>{fix.summary.whatChanges}</p>
            </div>
            {fix.summary.whatUsersNotice && (
              <div className="brief">
                <h3>What your users will notice</h3>
                <p>{fix.summary.whatUsersNotice}</p>
              </div>
            )}

            {replay && <AttackReplay replay={replay} />}

            <div className="finding-row">
              <h2>Antibody&apos;s checks</h2>
              <span className="meta">Run on a patched copy, not your app</span>
            </div>
            <ul className="check-list">
              {checks.map((c) => (
                <CheckRow key={c.name} check={c} state={phase === "writing" ? "waiting" : c.status} />
              ))}
            </ul>

            <Decision
              fix={fix}
              onUpdate={(f) => {
                if (f) setData(f);
                refresh(); // restarts polling in case a revision put the fix back into drafting
              }}
            />

            <div className="finding-row">
              <h2>The code change</h2>
              {fix.filesChanged.length > 0 && (
                <span className="meta">
                  {fix.filesChanged.length} file{fix.filesChanged.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
            {fix.diff ? <DiffView diff={fix.diff} /> : <p className="sub">Droid hasn&apos;t returned a diff yet.</p>}
          </section>
        </div>
      </div>
    </div>
  );
}

function CheckRow({ check, state }: { check: FixCheck; state: CheckState }) {
  const label = CHECK_LABEL[check.name];
  return (
    <li>
      <span className={`check-pill ${state}`}>{CHECK_TEXT[state]}</span>
      <div>
        <h3>{label.title}</h3>
        <p>{state === "waiting" ? `${label.sub} runs once Droid's fix is in.` : check.detail || label.sub}</p>
      </div>
    </li>
  );
}

/** The same request, sent to the app as it is and to the patched copy. */
function AttackReplay({ replay }: { replay: ExploitReplay }) {
  return (
    <>
      <div className="finding-row">
        <h2>Attack replay</h2>
        <code className="meta">{replay.request}</code>
      </div>
      <div className="replay">
        <ReplayPane label="Your app today" response={replay.before} />
        <ReplayPane label="With this fix" response={replay.after} />
      </div>
    </>
  );
}

function ReplayPane({ label, response }: { label: string; response: ReplayedResponse }) {
  const exposed = response.status >= 200 && response.status < 300;
  return (
    <figure className={`replay-pane ${exposed ? "exposed" : "blocked"}`}>
      <figcaption>
        <span>{label}</span>
        <span className={`check-pill ${exposed ? "fail" : "pass"}`}>
          {response.status || "No response"} · {exposed ? "data exposed" : "blocked"}
        </span>
      </figcaption>
      <pre>{response.body || "(empty body)"}</pre>
    </figure>
  );
}

function Decision({ fix, onUpdate }: { fix: FixProposal; onUpdate: (f?: FixProposal) => void }) {
  const [busy, setBusy] = useState<string>("");
  const [note, setNote] = useState<{ ok: boolean; text: string }>();
  const [instructions, setInstructions] = useState("");
  const decided = ["approved", "merged", "rejected", "rolled_back"].includes(fix.status);

  async function act(action: "approve" | "reject" | "revise") {
    setBusy(action);
    setNote(undefined);
    try {
      const res = await fetch(`/api/fixes/${fix.id}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...(action === "revise" ? { instructions } : {}), fix }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      onUpdate(data?.id ? data : undefined);
      if (action === "revise") setInstructions("");
      // After approval the pull request status line below says what happened in GitHub.
      setNote({ ok: true, text: action === "approve" ? "Approved." : action === "reject" ? "Rejected. Nothing will change in your code." : "Sent. Antibody is revising the fix." });
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : "Request failed" });
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <div className="finding-row">
        <h2>Your decision</h2>
        <span className="meta">Antibody never merges on its own</span>
      </div>
      <div className="report-actions">
        <button type="button" className="btn btn-lime" onClick={() => act("approve")} disabled={!!busy || fix.status !== "ready"}>
          {busy === "approve" ? "Approving…" : "Approve"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => act("reject")} disabled={!!busy || fix.status !== "ready"}>
          {busy === "reject" ? "Rejecting…" : "Reject"}
        </button>
        {fix.prUrl && (
          <a className="btn btn-ghost" href={fix.prUrl} target="_blank" rel="noreferrer">
            View pull request
          </a>
        )}
        {fix.previewUrl && (
          <a className="btn btn-ghost" href={fix.previewUrl} target="_blank" rel="noreferrer">
            Open preview
          </a>
        )}
      </div>
      <p className="decision-note">
        {fix.prNote && !fix.prUrl ? fix.prNote : fix.prUrl ? "Merge the pull request in GitHub, so you can always roll back." : "Approving records your decision. A pull request opens only when GitHub is connected."}
      </p>

      <form
        className="revise"
        onSubmit={(e) => {
          e.preventDefault();
          act("revise");
        }}
      >
        <label htmlFor="revise">Ask for changes</label>
        <div>
          <textarea
            id="revise"
            rows={2}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            disabled={decided}
            placeholder="e.g. Keep admins able to read the stats, only block everyone else"
          />
          <button type="submit" className="btn btn-ghost" disabled={!!busy || decided || !instructions.trim()}>
            {busy === "revise" ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
      {note && (
        <p role={note.ok ? "status" : "alert"} className={note.ok ? "decision-ok" : "alert"}>
          {note.text}
        </p>
      )}
    </>
  );
}

function DiffView({ diff }: { diff: string }) {
  const rows = parseDiff(diff);
  return (
    <div className="diff-table">
      <table>
        <tbody>
          {rows.map((r, i) => {
            if (r.kind === "file")
              return (
                <tr key={i} className="file">
                  <td colSpan={3}>{r.text}</td>
                </tr>
              );
            if (r.kind === "hunk")
              return (
                <tr key={i} className="hunk">
                  <td colSpan={3}>{r.text}</td>
                </tr>
              );
            const sign = r.kind === "add" ? "+" : r.kind === "del" ? "-" : " ";
            return (
              <tr key={i} className={r.kind}>
                <td className="no">{r.oldNo ?? ""}</td>
                <td className="no">{r.newNo ?? ""}</td>
                <td className="code">
                  <span className="sign">{sign}</span>
                  {r.text}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
