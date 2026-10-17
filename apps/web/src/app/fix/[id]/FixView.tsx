"use client";

import type { FixCheck, FixCheckName, FixProposal } from "@antibody/core";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Card, Icon, type IconName } from "@/components/ui";
import { usePoll } from "@/components/usePoll";
import { parseDiff } from "@/lib/diff";

const CHECK_LABEL: Record<FixCheckName, { title: string; sub: string }> = {
  exploit_test: { title: "The attack no longer works", sub: "Exploit test" },
  behavior_tests: { title: "Your app still behaves the same", sub: "Behavior tests" },
  preview_replay: { title: "Real traffic replayed on a preview", sub: "Preview replay" },
  second_review: { title: "A second reviewer agrees", sub: "Second review" },
};
const CHECK_ORDER = Object.keys(CHECK_LABEL) as FixCheckName[];

const CHECK_LOOK: Record<FixCheck["status"], { icon: IconName; cls: string; text: string }> = {
  pass: { icon: "check", cls: "text-mint bg-mint/10", text: "Passed" },
  fail: { icon: "x", cls: "text-red-300 bg-red-500/15", text: "Failed" },
  pending: { icon: "clock", cls: "text-slate-300 bg-white/5 animate-pulse", text: "Running" },
  skipped: { icon: "arrow", cls: "text-slate-400 bg-white/5", text: "Skipped" },
};

const STATUS_LABEL: Record<FixProposal["status"], string> = {
  drafting: "Drafting",
  ready: "Ready for review",
  rejected: "Rejected",
  approved: "Approved",
  merged: "Merged",
  rolled_back: "Rolled back",
};

export function FixView() {
  const { id } = useParams<{ id: string }>();
  const { data: fix, error, setData, refresh } = usePoll<FixProposal>(
    `/api/fixes/${id}`,
    2000,
    // Also keep polling while a just-approved fix waits for its pull request.
    (f) =>
      f.status === "drafting" ||
      f.checks.some((c) => c.status === "pending") ||
      (f.status === "approved" && !f.prUrl && (!f.prNote || f.prNote.startsWith("Opening"))),
  );

  if (!fix) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-16">
        <p className="text-slate-400">{error ? `Couldn't load this fix: ${error}` : "Loading fix…"}</p>
      </div>
    );
  }

  const checks = CHECK_ORDER.map((name) => fix.checks.find((c) => c.name === name) ?? { name, status: "pending" as const, detail: "" });

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full border border-line px-3 py-1 text-xs font-medium uppercase tracking-wide text-slate-300">{STATUS_LABEL[fix.status]}</span>
        {fix.author === "droid" ? (
          <span className="rounded-full bg-violet-400/10 px-3 py-1 text-xs font-medium text-violet-200">Written by Factory Droid</span>
        ) : (
          <span className="rounded-full bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-200">Mock fixer (no Factory key): canned demo fix</span>
        )}
      </div>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">Review this fix</h1>
      <p className="mt-2 text-slate-400">Plain English first. The code is below if you want it.</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Explain title="What was wrong" body={fix.summary.whatWasWrong} icon="alert" tone="text-orange-300" />
          <Explain title="What changes" body={fix.summary.whatChanges} icon="wrench" tone="text-mint" />
          <Explain title="What your users will notice" body={fix.summary.whatUsersNotice} icon="message" tone="text-sky-300" />
        </div>

        <aside className="space-y-4" aria-label="Fix details">
          <Card className="p-5">
            <dl className="grid grid-cols-3 gap-3 text-center">
              <div>
                <dt className="text-xs text-slate-400">Confidence</dt>
                <dd className={`mt-1 text-lg font-semibold capitalize ${fix.confidence === "high" ? "text-mint" : fix.confidence === "medium" ? "text-amber-200" : "text-red-300"}`}>{fix.confidence}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Files</dt>
                <dd className="mt-1 text-lg font-semibold text-white">{fix.filesChanged.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Lines</dt>
                <dd className="mt-1 text-lg font-semibold text-white">{fix.linesChanged}</dd>
              </div>
            </dl>
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-400">Checks</h2>
            <ul className="space-y-3">
              {checks.map((c) => (
                <CheckRow key={c.name} check={c} />
              ))}
            </ul>
          </Card>
        </aside>
      </div>

      <Actions
        fix={fix}
        onUpdate={(f) => {
          if (f) setData(f);
          refresh(); // restarts polling in case a revision put the fix back into drafting
        }}
      />

      <section aria-labelledby="diff" className="mt-10">
        <h2 id="diff" className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-400">The code change</h2>
        {fix.diff ? <DiffView diff={fix.diff} /> : <p className="text-slate-500">No diff yet.</p>}
      </section>
    </div>
  );
}

function Explain({ title, body, icon, tone }: { title: string; body: string; icon: IconName; tone: string }) {
  return (
    <Card className="flex gap-4 p-6">
      <Icon name={icon} className={`mt-1 h-5 w-5 shrink-0 ${tone}`} />
      <div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="mt-1 leading-relaxed text-slate-300">{body || "…"}</p>
      </div>
    </Card>
  );
}

function CheckRow({ check }: { check: FixCheck }) {
  const label = CHECK_LABEL[check.name];
  const look = CHECK_LOOK[check.status];
  return (
    <li className="flex gap-3">
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${look.cls}`}>
        <Icon name={look.icon} className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{label.title}</p>
        <p className="text-xs text-slate-400">
          {label.sub}: <span className="font-medium">{look.text}</span>
          {check.detail && <> · {check.detail}</>}
        </p>
      </div>
    </li>
  );
}

function Actions({ fix, onUpdate }: { fix: FixProposal; onUpdate: (f?: FixProposal) => void }) {
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
        body: JSON.stringify(action === "revise" ? { instructions } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      onUpdate(data?.id ? data : undefined);
      if (action === "revise") setInstructions("");
      setNote({ ok: true, text: action === "approve" ? "Approved. With GitHub connected, Antibody opens a pull request in a few seconds. You merge it in GitHub." : action === "reject" ? "Rejected. Nothing will change in your code." : "Sent. Antibody is revising the fix." });
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : "Request failed" });
    } finally {
      setBusy("");
    }
  }

  return (
    <Card className="mt-6 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => act("approve")} disabled={!!busy || fix.status !== "ready"} className="press inline-flex items-center gap-2 rounded-lg bg-mint px-5 py-2.5 font-semibold text-ink hover:brightness-110 disabled:opacity-50">
          <Icon name="approve" className="h-4 w-4" /> {busy === "approve" ? "Approving…" : "Approve"}
        </button>
        <button onClick={() => act("reject")} disabled={!!busy || fix.status !== "ready"} className="press inline-flex items-center gap-2 rounded-lg border border-line px-5 py-2.5 font-semibold text-slate-200 hover:bg-white/5 disabled:opacity-50">
          <Icon name="x" className="h-4 w-4" /> {busy === "reject" ? "Rejecting…" : "Reject"}
        </button>
        {fix.prUrl && <a href={fix.prUrl} target="_blank" rel="noreferrer" className="text-sm text-mint hover:underline">View pull request</a>}
        {fix.prNote && !fix.prUrl && <span className="text-sm text-slate-400">{fix.prNote}</span>}
        {fix.previewUrl && <a href={fix.previewUrl} target="_blank" rel="noreferrer" className="text-sm text-mint hover:underline">Open preview</a>}
      </div>
      <p className="mt-3 text-sm text-slate-400">Approving opens a pull request. Permanent merges happen in GitHub, so you can always roll back.</p>

      <form
        className="mt-5"
        onSubmit={(e) => {
          e.preventDefault();
          act("revise");
        }}
      >
        <label htmlFor="revise" className="text-sm font-medium text-slate-200">Ask for changes</label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <textarea
            id="revise"
            rows={2}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            disabled={decided}
            placeholder="e.g. Keep the public pricing page open, only lock down /admin"
            className="min-h-[3rem] flex-1 rounded-lg border border-line bg-black/30 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-mint/60 focus:outline-none disabled:opacity-50"
          />
          <button type="submit" disabled={!!busy || decided || !instructions.trim()} className="press rounded-lg border border-mint/50 px-5 py-2 font-semibold text-mint hover:bg-mint/10 disabled:opacity-50">
            {busy === "revise" ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
      {note && (
        <p role={note.ok ? "status" : "alert"} className={`animate-rise mt-4 rounded-lg px-3 py-2 text-sm ${note.ok ? "bg-mint/10 text-mint" : "border border-red-500/40 bg-red-500/10 text-red-200"}`}>
          {note.text}
        </p>
      )}
    </Card>
  );
}

function DiffView({ diff }: { diff: string }) {
  const rows = parseDiff(diff);
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-black/40 font-mono text-[13px] leading-6">
      <table className="w-full border-collapse">
        <tbody>
          {rows.map((r, i) => {
            if (r.kind === "file")
              return (
                <tr key={i} className="bg-panel">
                  <td colSpan={3} className="border-y border-line px-4 py-2 font-sans text-sm font-semibold text-white">{r.text}</td>
                </tr>
              );
            if (r.kind === "hunk")
              return (
                <tr key={i} className="bg-sky-400/5 text-sky-300/80">
                  <td colSpan={3} className="px-4">{r.text}</td>
                </tr>
              );
            const cls = r.kind === "add" ? "bg-emerald-500/10 text-emerald-200" : r.kind === "del" ? "bg-red-500/10 text-red-200" : "text-slate-300";
            const sign = r.kind === "add" ? "+" : r.kind === "del" ? "-" : " ";
            return (
              <tr key={i} className={cls}>
                <td className="w-12 select-none px-2 text-right text-slate-600">{r.oldNo ?? ""}</td>
                <td className="w-12 select-none px-2 text-right text-slate-600">{r.newNo ?? ""}</td>
                <td className="whitespace-pre px-3">
                  <span className="select-none opacity-60">{sign}</span>
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
