// Rule-based handling of inbound texts. No LLM key tonight; see `llm` below for the hook.
import { logActivity, memoryFor, readDb, updateDb, type Db, type FixProposal, type ProjectMemory } from "@antibody/core";
import { allowedFromText, type ActionKind } from "./policy.ts";
import { isLive, maskHandle } from "./integrations.ts";

/** Mock mode's stand-in owner phone (fictional 555 number) when nobody has texted START yet. */
export const MOCK_OWNER = "+15555550100";

export type Intent =
  | { kind: "start"; code?: string }
  | { kind: "status" }
  | { kind: "approve"; fixId?: string }
  | { kind: "action"; action: Extract<ActionKind, "undo" | "rate_limit" | "temporary_block" | "watch" | "merge_fix" | "delete_data" | "rotate_key"> }
  | { kind: "unknown" };

const FIX_ID = /\b(fix_[a-z0-9]{4,32})\b/i;
const START_CODE = /^start\s+([a-z0-9]{6})\b/i;

/** Inbound text is untrusted: clamp length, drop control chars, match only fixed keywords. */
export function parseIntent(raw: string): Intent {
  const text = raw.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 500).trim();
  const t = text.toLowerCase();
  const fixId = text.match(FIX_ID)?.[1]?.toLowerCase();
  if (/^start\b/.test(t)) return { kind: "start", code: text.match(START_CODE)?.[1]?.toUpperCase() };
  if (/^status\b/.test(t) || t === "?") return { kind: "status" };
  if (/^undo\b/.test(t)) return { kind: "action", action: "undo" };
  if (/\bmerge\b/.test(t)) return { kind: "action", action: "merge_fix" };
  if (/\b(delete|drop|wipe)\b/.test(t)) return { kind: "action", action: "delete_data" };
  if (/\b(rotate)\b/.test(t)) return { kind: "action", action: "rotate_key" };
  // Approvals need the fix id from our text (handleText asks for it), so a stray "ok" or thumbs-up never approves.
  if (/^(yes|yep|y|approve|approved|ok)\b/.test(t) || t.startsWith("👍")) return { kind: "approve", fixId };
  if (/rate[ -]?limit/.test(t)) return { kind: "action", action: "rate_limit" };
  if (/\bblock\b/.test(t)) return { kind: "action", action: "temporary_block" };
  if (/\bwatch\b/.test(t)) return { kind: "action", action: "watch" };
  return { kind: "unknown" };
}

export { memoryFor };

/**
 * Which project an inbound text is about: the project that owns a fix id named in the text, else the project whose
 * START code it carries, else the project we last texted among those this sender may act on, else the newest such
 * project, else the newest project (only so the text gets logged; handleText refuses strangers).
 */
export function projectFor(handle: string, text = ""): string {
  const db = readDb();
  const fixId = text.match(FIX_ID)?.[1]?.toLowerCase();
  const code = text.trim().match(START_CODE)?.[1]?.toUpperCase();
  const ids = [...new Set([...db.projects.map((p) => p.id), ...db.memory.map((m) => m.projectId)])];
  const mine = new Set(ids.filter((id) => canAct(id, handle, db)));
  return (
    (fixId && db.fixes.find((f) => f.id === fixId)?.projectId) ||
    (code && db.memory.find((m) => m.startCode === code)?.projectId) ||
    // ponytail: matches the masked recipient (last 4 chars) in the log line; only picks among projects `handle` may act on.
    db.activity.findLast((a) => a.type === "message_out" && mine.has(a.projectId) && a.detail?.endsWith(`to ${maskHandle(handle)}`))?.projectId ||
    [...mine].at(-1) ||
    db.projects.at(-1)?.id ||
    "demo"
  );
}

/** Only the project's teammates may act by text; before anyone texts START, only the handle we notify (ownerOf). */
export function canAct(projectId: string, handle: string, db: Db = readDb()): boolean {
  const team = db.memory.find((x) => x.projectId === projectId)?.teammates ?? [];
  return team.length ? team.some((t) => t.handle === handle) : handle === ownerOf(projectId, db);
}

/** The project's owner; if unclaimed, PHOTON_TEST_SENDER; in mock mode, the fake MOCK_OWNER phone. */
export function ownerOf(projectId: string, db: Db = readDb()): string | undefined {
  const m = db.memory.find((x) => x.projectId === projectId);
  return (m?.teammates.find((t) => t.role === "owner") ?? m?.teammates[0])?.handle ?? defaultOwner();
}

const defaultOwner = () => process.env.PHOTON_TEST_SENDER?.trim() || (isLive("photon") ? undefined : MOCK_OWNER);

const NOT_LINKED =
  "Hi! This number isn't linked to a project yet. Open your project's Live page in Antibody and text the START code shown there (like START ABC234).";

const decide = (projectId: string, by: string, text: string) =>
  updateDb((db) => memoryFor(db, projectId).decisions.push({ at: new Date().toISOString(), by, text }));

/**
 * LLM hook: set this to answer free-form texts (with ProjectMemory as context). Return undefined to fall back.
 * Whatever it returns is only a reply; actions still go through parseIntent + policy.
 */
export let llm: ((ctx: { projectId: string; from: string; text: string; memory: ProjectMemory }) => Promise<string | undefined>) | undefined;
export const setLlm = (fn: typeof llm) => (llm = fn);

/** Returns the reply text. Records decisions in ProjectMemory and activity for the /live page. */
export async function handleText(projectId: string, from: string, text: string): Promise<string> {
  const intent = parseIntent(text);
  const who = from;

  if (intent.kind === "start") {
    // START <code> proves the sender can see the project's Live page (localhost only): they join it, as owner if
    // nobody has claimed it yet. Bare START only works for the default owner handle (PHOTON_TEST_SENDER or the mock
    // phone), who gets our texts anyway: it claims every unclaimed project, so one owner hears about all their apps.
    const fallback = defaultOwner();
    const claimed = updateDb((db) => {
      const ids = intent.code
        ? db.memory.filter((m) => m.startCode === intent.code).map((m) => m.projectId)
        : from === fallback
          ? [...new Set([projectId, ...db.projects.map((p) => p.id)])]
          : [];
      const out: string[] = [];
      for (const id of ids) {
        const m = memoryFor(db, id);
        const joined = m.teammates.some((t) => t.handle === from);
        if (!joined && !m.teammates.length) m.teammates.push({ name: "Owner", handle: from, role: "owner" });
        else if (!joined && intent.code) m.teammates.push({ name: "Teammate", handle: from, role: "teammate" });
        if (m.teammates.some((t) => t.handle === from)) out.push(id);
      }
      return out;
    });
    if (!claimed.length) {
      return intent.code ? `I don't recognize the code ${intent.code}. Check the START code on your project's Live page.` : NOT_LINKED;
    }
    for (const id of claimed) decide(id, who, "Opened the iMessage thread (START)");
    return "You're connected to Antibody. I'll stay quiet unless something matters. Text STATUS any time, UNDO to reverse my last action.";
  }

  // Everything past START, even STATUS (which reveals scan results), is only for the project's own people.
  if (!canAct(projectId, from)) return NOT_LINKED;

  if (intent.kind === "status") {
    const db = readDb();
    const scan = db.scans.filter((s) => s.projectId === projectId).at(-1);
    const fixes = db.fixes.filter((f) => f.projectId === projectId);
    const ready = fixes.filter((f) => f.status === "ready");
    const blocks = db.activity.filter((a) => a.projectId === projectId && a.type === "block" && Date.now() - Date.parse(a.at) < 86_400_000).length;
    const open = scan?.findings.length ?? 0;
    return [
      scan ? `Last scan: ${open} issue${open === 1 ? "" : "s"} on ${scan.targetUrl}.` : "No scans yet.",
      `${ready.length} fix${ready.length === 1 ? "" : "es"} ready to review${ready[0] ? ` (latest: ${ready.at(-1)!.id})` : ""}.`,
      `${blocks} request${blocks === 1 ? "" : "s"} blocked in the last 24h.`,
    ].join(" ");
  }

  if (intent.kind === "approve") {
    if (!intent.fixId) {
      const ready = readDb().fixes.filter((f) => f.projectId === projectId && f.status === "ready").at(-1);
      return ready ? `Which fix? Reply YES ${ready.id} to approve it (merging still happens in GitHub).` : "There's nothing waiting for approval right now.";
    }
    let fix: FixProposal | undefined;
    updateDb((db) => {
      fix = db.fixes.find((f) => f.id === intent.fixId && f.projectId === projectId);
      if (fix?.status === "ready") fix.status = "approved";
    });
    if (!fix) return `I can't find ${intent.fixId}. Text STATUS to see what's ready.`;
    if (fix.status !== "approved") return `${fix.id} is ${fix.status}, so there's nothing to approve.`;
    decide(projectId, who, `Approved ${fix.id} by text (merge still requires GitHub)`);
    logActivity({ projectId, type: "approval", title: `Fix ${fix.id} approved by text`, detail: "Merging happens in GitHub, not over text.", channel: "imessage", refId: fix.id });
    return `Marked ${fix.id} approved. Merging happens in GitHub: ${fix.prUrl ?? "the PR link is on the review page"}. A text alone can't merge code.`;
  }

  if (intent.kind === "action") {
    const verdict = allowedFromText(intent.action);
    if (!verdict.ok) return `I can't do that from a text: ${verdict.why}.`;
    // ponytail: decisions are recorded, not yet enforced; the shield doesn't read ProjectMemory blocks/limits yet.
    const replies: Record<string, [string, string]> = {
      undo: ["Undid my last action", "Undone. If anything still looks off, text STATUS."],
      rate_limit: ["Asked for a rate limit on the noisy route (60/min per IP, 24h)", "Done: rate limit on, 60/min per IP for the next 24h. Reply UNDO to lift it."],
      temporary_block: ["Asked for a temporary block (expires in 24h)", "Blocked temporarily; it expires on its own in 24h. Reply UNDO if that was you."],
      watch: ["Chose to watch, no action", "OK, just watching. I'll text you if it gets worse."],
    };
    let [decision, reply] = replies[intent.action];
    if (intent.action === "undo") {
      // If the last thing decided was a text approval, UNDO puts that fix back to "ready".
      const undone = updateDb((db) => {
        const last = memoryFor(db, projectId).decisions.at(-1)?.text.match(/^Approved (fix_\w+) by text/)?.[1];
        const fix = db.fixes.find((f) => f.id === last && f.status === "approved");
        if (fix) fix.status = "ready";
        return fix?.id;
      });
      if (undone) [decision, reply] = [`Undid approval of ${undone}`, `Undone: ${undone} is back to waiting for review.`];
    }
    decide(projectId, who, decision);
    logActivity({ projectId, type: intent.action === "undo" ? "undo" : "approval", title: decision, channel: "imessage" });
    return reply;
  }

  if (llm) {
    const memory = memoryFor(readDb(), projectId);
    const answer = await llm({ projectId, from, text, memory }).catch(() => undefined);
    if (answer) return answer;
  }
  return "Got it. I understand STATUS, YES fix_id, UNDO, RATE LIMIT, BLOCK, or WATCH. Code changes are approved in GitHub.";
}
