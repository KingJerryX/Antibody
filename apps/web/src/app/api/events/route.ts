import { after } from "next/server";
import { bearerMatches, logActivity, type ActivityEvent, type ActivityType, type Channel, type ShieldDecision } from "@antibody/core";
import { proxyToOrchestrator, readStore } from "@/lib/server";

const TYPES: ActivityType[] = ["scan_started", "scan_done", "finding", "fix_drafting", "fix_ready", "message_out", "message_in", "call", "block", "approval", "undo"];
const CHANNELS: Channel[] = ["imessage", "voice", "email", "github", "web"];
const SOURCES: ShieldDecision["source"][] = ["chalk", "local", "fail_open"];
const str = (v: unknown, max: number) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : undefined);
const sourceOf = (v: unknown): ShieldDecision["source"] | undefined => (typeof v === "string" && SOURCES.includes(v as ShieldDecision["source"]) ? (v as ShieldDecision["source"]) : undefined);
const riskOf = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1 ? v : undefined);

/** Blocks closer together than this are one attack: the owner hears about the first one only. */
const ATTACK_GAP_MS = 10 * 60_000;
/** The shield's block threshold; a lower score was a 429 "slow down", not worth a phone call. */
const BLOCK_AT = 0.9;

/**
 * The shield reports blocks here. A block can ring the owner's phone, so callers need the shared token
 * (the one the web app and orchestrator use). ponytail: one token for every shield; issue per-project keys
 * before the shield ships in apps we don't run ourselves.
 */
export async function POST(request: Request) {
  const token = process.env.ANTIBODY_ORCHESTRATOR_TOKEN?.trim();
  // Local dev without a token stays open; a deployed site never does.
  if (token ? !bearerMatches(request.headers.get("authorization"), token) : process.env.VERCEL) {
    return Response.json({ error: "missing or wrong token" }, { status: 401 });
  }
  const b = await request.json().catch(() => null);
  const projectId = str(b?.projectId, 100);
  const title = str(b?.title, 300);
  if (!projectId || !title || !TYPES.includes(b?.type)) {
    return Response.json({ error: "Body needs projectId, title and a valid type" }, { status: 400 });
  }
  const event: Omit<ActivityEvent, "id" | "at"> = {
    projectId,
    type: b.type,
    title,
    detail: str(b.detail, 2000),
    channel: CHANNELS.includes(b.channel) ? b.channel : undefined,
    refId: str(b.refId, 100),
    source: sourceOf(b.source),
    riskScore: riskOf(b.riskScore),
  };
  const alert = event.type === "block" && (event.riskScore ?? 1) >= BLOCK_AT ? await firstBlockOfAttack(projectId) : undefined;
  const logged = await logActivity(event);
  if (alert) {
    // After the response, so the shield's report never waits on Photon. critical + active = text now, call if no reply.
    const text = `Antibody just blocked an attack on ${alert}: ${title}${event.detail ? `, because ${event.detail}` : ""}. Reply STATUS for details.`;
    after(() => proxyToOrchestrator("/notify", { projectId, severity: "critical", active: true, text, refId: logged.id }).then(() => undefined, () => undefined));
  }
  return Response.json(logged, { status: 201 });
}

/** The site's name if this is the first block in ATTACK_GAP_MS for the project, else undefined. */
async function firstBlockOfAttack(projectId: string): Promise<string | undefined> {
  const db = await readStore();
  const since = Date.now() - ATTACK_GAP_MS;
  if (db.activity.some((a) => a.projectId === projectId && a.type === "block" && (a.riskScore ?? 1) >= BLOCK_AT && Date.parse(a.at) > since)) return undefined;
  const url = db.projects.find((p) => p.id === projectId)?.url;
  return (url && URL.parse(url)?.host) || "your app";
}
