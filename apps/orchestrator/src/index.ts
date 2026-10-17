// Orchestrator: plain node:http on :3001. Routes are the contract in AGENTS.md / the web app's proxy.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { logActivity, memoryFor, newId, readDb, updateDb, type FixProposal, type Severity } from "@antibody/core";
import { integrations, logIntegrations, maskHandle } from "./integrations.ts";
import { createMessenger, MockMessenger } from "./messenger.ts";
import { canAct, handleText, ownerOf, projectFor } from "./conversation.ts";
import { createFixer, DroidFixer } from "./fixer.ts";
import { deliveryFor } from "./policy.ts";
import { placeCall } from "./voice.ts";
import { handleGithubWebhook } from "./github.ts";

const messenger = createMessenger();
const fixer = createFixer();

// ---------- inbound texts ----------
// ponytail: escalation timers live in this process; a restart forgets a pending "call in 5 min".
const pendingCalls = new Map<string, NodeJS.Timeout>();

messenger.start(async ({ from, text }) => {
  const projectId = projectFor(from, text);
  const body = text.slice(0, 2000);
  logActivity({ projectId, type: "message_in", title: body.slice(0, 280), detail: `from ${maskHandle(from)}${messenger.mode === "mock" ? " [mock]" : ""}`, channel: "imessage" });
  // A reply from the project's own people counts as "the human responded": cancel the escalation call.
  if (canAct(projectId, from)) {
    clearTimeout(pendingCalls.get(projectId));
    pendingCalls.delete(projectId);
  }
  await messenger.send(from, handleText(projectId, from, body), { projectId });
});

// ---------- notify (interrupt budget) ----------
async function notify(projectId: string, severity: Severity, text: string, active = false, refId?: string) {
  const db = readDb();
  const delivery = deliveryFor({ severity, active }, new Date(), memoryFor(db, projectId).preferences.quietHours);
  const to = ownerOf(projectId, db);
  if (delivery.route !== "text_now") {
    // ponytail: digests and quiet-hours holds are only logged; no scheduler sends them yet.
    console.log(`[notify] ${projectId} ${severity}: queued for ${delivery.route}`);
    return { delivery, sent: false };
  }
  if (!to) {
    console.warn(`[notify] ${projectId}: no owner handle (text START to the agent, or set PHOTON_TEST_SENDER)`);
    return { delivery, sent: false, error: "no owner handle" };
  }
  await messenger.send(to, text, { projectId, refId });
  if (delivery.callAfterMs) {
    clearTimeout(pendingCalls.get(projectId));
    const ms = Number(process.env.ANTIBODY_CALL_AFTER_MS || delivery.callAfterMs); // override only to demo faster
    pendingCalls.set(
      projectId,
      setTimeout(() => {
        pendingCalls.delete(projectId);
        void placeCall(to, { projectId, script: text, refId }, messenger).catch((e) => console.error("[voice]", e));
      }, ms),
    );
  }
  return { delivery, sent: true };
}

// ---------- fixes ----------
const saveFix = (id: string, patch: Partial<FixProposal>) =>
  updateDb((db) => {
    const f = db.fixes.find((x) => x.id === id)!;
    Object.assign(f, patch);
    return { ...f };
  });

function findFinding(findingId: string) {
  return readDb().scans.flatMap((s) => s.findings).find((f) => f.id === findingId);
}

/** Drafts in the background; resolves once the proposal is ready (or failed back to "rejected" with a note). */
async function draftFix(fix: FixProposal, instructions?: string): Promise<FixProposal> {
  const fixId = fix.id;
  const finding = findFinding(fix.findingId)!;
  try {
    const draft = await fixer.draft(finding, instructions);
    const ready = saveFix(fixId, { ...draft, status: "ready" });
    logActivity({ projectId: fix.projectId, type: "fix_ready", title: `Fix ready: ${finding.title}`, detail: `${draft.linesChanged} lines, confidence ${draft.confidence}${draft.author === "mock" ? " [mock fixer]" : ""}`, channel: "web", refId: fixId });
    await notify(fix.projectId, finding.severity, `Fix ready for "${finding.title}": ${draft.summary.whatChanges} Review it, then reply YES ${fixId} (merging happens in GitHub).`, false, fixId);
    return ready;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[fixer] ${fixId} failed:`, msg);
    logActivity({ projectId: fix.projectId, type: "fix_drafting", title: `Couldn't draft a fix for ${finding.title}`, detail: msg.slice(0, 300), channel: "web", refId: fixId });
    return saveFix(fixId, { status: "rejected", summary: { ...fix.summary, whatChanges: `Drafting failed: ${msg.slice(0, 200)}` } });
  }
}

async function startFix(findingId: string): Promise<FixProposal | undefined> {
  const finding = findFinding(findingId);
  if (!finding) return undefined;
  const fix: FixProposal = {
    id: newId("fix"),
    projectId: finding.projectId,
    findingId,
    status: "drafting",
    summary: { whatWasWrong: finding.plainEnglish, whatChanges: "Drafting…", whatUsersNotice: "" },
    diff: "",
    filesChanged: [],
    linesChanged: 0,
    confidence: "low",
    checks: [],
    author: fixer instanceof DroidFixer ? "droid" : "mock",
    createdAt: new Date().toISOString(),
  };
  updateDb((db) => db.fixes.push(fix));
  logActivity({ projectId: fix.projectId, type: "fix_drafting", title: `Drafting a fix: ${finding.title}`, channel: "web", refId: fix.id });
  const done = draftFix(fix);
  // Mock is instant, so return the ready fix; Droid takes minutes, so return "drafting" and let the web poll GET /api/fixes/[id].
  return fix.author === "mock" ? done : fix;
}

// ---------- http ----------
async function readJson(req: IncomingMessage): Promise<{ raw: string; json: Record<string, unknown> }> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw Object.assign(new Error("body too large"), { status: 413 });
  }
  try {
    return { raw, json: raw ? JSON.parse(raw) : {} };
  } catch {
    if (req.url?.startsWith("/github/")) return { raw, json: {} };
    throw Object.assign(new Error("invalid JSON"), { status: 400 });
  }
}

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

const str = (v: unknown, max = 2000) => (typeof v === "string" && v.trim() ? v.slice(0, max) : undefined);
const SEVERITIES = ["critical", "high", "medium", "low"];

async function route(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = req.method ?? "GET";

  if (method === "GET" && path === "/health") return send(res, 200, { ok: true, integrations: integrations() });
  if (method !== "POST") return send(res, 404, { error: "not found" });
  // Requiring JSON forces a CORS preflight (which we never answer), so a web page in the owner's browser
  // can't fire /notify or /fixes at localhost with a "simple" text/plain POST. The GitHub webhook is HMAC-checked instead.
  if (path !== "/github/webhook" && !req.headers["content-type"]?.startsWith("application/json")) return send(res, 415, { error: "content-type must be application/json" });

  const { raw, json } = await readJson(req);

  if (path === "/notify") {
    const projectId = str(json.projectId, 100);
    const severity = str(json.severity, 20);
    const text = str(json.text);
    if (!projectId || !text || !severity || !SEVERITIES.includes(severity)) return send(res, 400, { error: "need projectId, severity (critical|high|medium|low), text" });
    return send(res, 200, await notify(projectId, severity as Severity, text, json.active === true, str(json.refId, 100)));
  }

  if (path === "/fixes") {
    const findingId = str(json.findingId, 100);
    if (!findingId) return send(res, 400, { error: "need findingId" });
    const fix = await startFix(findingId);
    return fix ? send(res, 201, fix) : send(res, 404, { error: `finding ${findingId} not found` });
  }

  const m = path.match(/^\/fixes\/([\w-]+)\/(approve|reject|revise)$/);
  if (m) {
    const [, id, action] = m;
    const fix = readDb().fixes.find((f) => f.id === id);
    if (!fix) return send(res, 404, { error: `fix ${id} not found` });
    if (action === "approve") {
      if (fix.status !== "ready") return send(res, 409, { error: `fix is ${fix.status}, only ready fixes can be approved` });
      logActivity({ projectId: fix.projectId, type: "approval", title: `Fix ${id} approved on the review page`, detail: "Antibody never merges; merge the PR in GitHub.", channel: "web", refId: id });
      updateDb((db) => memoryFor(db, fix.projectId).decisions.push({ at: new Date().toISOString(), by: "web", text: `Approved ${id}` }));
      return send(res, 200, saveFix(id, { status: "approved" }));
    }
    if (action === "reject") {
      if (!["ready", "drafting"].includes(fix.status)) return send(res, 409, { error: `fix is ${fix.status}` });
      logActivity({ projectId: fix.projectId, type: "approval", title: `Fix ${id} rejected`, channel: "web", refId: id });
      return send(res, 200, saveFix(id, { status: "rejected" }));
    }
    const instructions = str(json.instructions, 1000);
    if (!instructions) return send(res, 400, { error: "need instructions" });
    if (fix.status !== "ready" && fix.status !== "rejected") return send(res, 409, { error: `fix is ${fix.status}` });
    updateDb((db) => memoryFor(db, fix.projectId).decisions.push({ at: new Date().toISOString(), by: "web", text: `Asked to revise ${id}: ${instructions.slice(0, 200)}` }));
    const drafting = saveFix(id, { status: "drafting" });
    logActivity({ projectId: fix.projectId, type: "fix_drafting", title: `Revising fix ${id}`, detail: instructions.slice(0, 200), channel: "web", refId: id });
    const done = draftFix(fix, instructions);
    return send(res, 200, fix.author === "mock" ? await done : drafting);
  }

  // Mock mode's stand-in for a phone: lets the web /live page or curl "text" the agent.
  if (path === "/inbound") {
    if (!(messenger instanceof MockMessenger)) return send(res, 409, { error: "Photon is live; text the agent from a real phone" });
    const from = str(json.from, 100);
    const text = str(json.text);
    if (!from || !text) return send(res, 400, { error: "need from, text" });
    await messenger.simulateInbound({ from, text });
    return send(res, 200, { ok: true });
  }

  if (path === "/github/webhook") {
    const projectId = str(url.searchParams.get("projectId"), 100) ?? readDb().projects.at(-1)?.id ?? "demo";
    const status = handleGithubWebhook(raw, req.headers, projectId);
    return send(res, status, { status });
  }

  return send(res, 404, { error: "not found" });
}

const server = createServer((req, res) => {
  route(req, res).catch((err: Error & { status?: number }) => {
    console.error(`[orchestrator] ${req.method} ${req.url}:`, err.message);
    if (!res.headersSent) send(res, err.status ?? 500, { error: err.status ? err.message : "internal error" });
  });
});

logIntegrations();
// Local dev stays on loopback: /notify and /fixes are unauthenticated and can text the owner.
// When PORT is set (Vercel), listen on all interfaces so the internal service binding can reach this process.
// The port passed to listen is local-only; Vercel routes the binding to its own internal port.
// ponytail: no auth token; put a shared-secret header on these routes before any public rewrite targets this service.
const port = Number(process.env.PORT ?? 3001);
const onListen = () => console.log(`[orchestrator] listening on http://${process.env.PORT ? "0.0.0.0" : "127.0.0.1"}:${port} (imessage: ${messenger.mode})`);
if (process.env.PORT) server.listen(port, onListen);
else server.listen(port, "127.0.0.1", onListen);

const shutdown = () => {
  messenger.stop();
  server.close(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
