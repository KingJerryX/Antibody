import { logActivity, type ActivityEvent, type ActivityType, type Channel } from "@antibody/core";
import { json } from "@/lib/server";

const TYPES: ActivityType[] = ["scan_started", "scan_done", "finding", "fix_drafting", "fix_ready", "message_out", "message_in", "call", "block", "approval", "undo"];
const CHANNELS: Channel[] = ["imessage", "voice", "email", "github", "web"];
const str = (v: unknown, max: number) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : undefined);

// ponytail: unauthenticated, fine on localhost; add a shared secret header before exposing the web app publicly.
export async function POST(request: Request) {
  const b = await request.json().catch(() => null);
  const projectId = str(b?.projectId, 100);
  const title = str(b?.title, 300);
  if (!projectId || !title || !TYPES.includes(b?.type)) {
    return json({ error: "Body needs projectId, title and a valid type" }, 400);
  }
  const event: Omit<ActivityEvent, "id" | "at"> = {
    projectId,
    type: b.type,
    title,
    detail: str(b.detail, 2000),
    channel: CHANNELS.includes(b.channel) ? b.channel : undefined,
    refId: str(b.refId, 100),
  };
  return json(logActivity(event), 201);
}
