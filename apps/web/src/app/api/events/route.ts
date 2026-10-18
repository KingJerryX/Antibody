import { logActivity, type ActivityEvent, type ActivityType, type Channel, type ShieldDecision } from "@antibody/core";

const TYPES: ActivityType[] = ["scan_started", "scan_done", "finding", "fix_drafting", "fix_ready", "message_out", "message_in", "call", "block", "approval", "undo"];
const CHANNELS: Channel[] = ["imessage", "voice", "email", "github", "web"];
const SOURCES: ShieldDecision["source"][] = ["chalk", "local", "fail_open"];
const str = (v: unknown, max: number) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : undefined);
const sourceOf = (v: unknown): ShieldDecision["source"] | undefined => (typeof v === "string" && SOURCES.includes(v as ShieldDecision["source"]) ? (v as ShieldDecision["source"]) : undefined);
const riskOf = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1 ? v : undefined);

// ponytail: unauthenticated, fine on localhost; add a shared secret header before exposing the web app publicly.
export async function POST(request: Request) {
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
  return Response.json(await logActivity(event), { status: 201 });
}
