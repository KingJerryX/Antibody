// Emergency phone calls: ElevenLabs voice agent dialing out through the Photon SIP trunk, or a mock.
import { logActivity, updateDb } from "@antibody/core";
import { isLive, maskHandle } from "./integrations.ts";
import { memoryFor } from "./conversation.ts";
import type { Messenger } from "./messenger.ts";

export interface CallContext {
  projectId: string;
  /** What the agent opens with, in plain English. */
  script: string;
  /** Short facts the voice agent may use to answer questions ("212 records, emails + names, no passwords"). */
  facts?: string;
  refId?: string;
}

export interface CallResult {
  mode: "live" | "mock";
  callId?: string;
}

/**
 * Photon's docs cover outbound calls only as dashboard setup (SIP trunk imported into ElevenLabs);
 * the call itself is ElevenLabs' "outbound call via SIP trunk" API.
 * ponytail: written from ElevenLabs' API reference, not yet exercised against a real number.
 */
async function elevenLabsCall(to: string, ctx: CallContext): Promise<string | undefined> {
  const res = await fetch("https://api.elevenlabs.io/v1/convai/sip-trunk/outbound-call", {
    method: "POST",
    headers: { "content-type": "application/json", "xi-api-key": process.env.ELEVENLABS_API_KEY! },
    body: JSON.stringify({
      agent_id: process.env.ELEVENLABS_AGENT_ID,
      agent_phone_number_id: process.env.ELEVENLABS_PHONE_NUMBER_ID,
      to_number: to,
      conversation_initiation_client_data: { dynamic_variables: { opening: ctx.script, facts: ctx.facts ?? "" } },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs outbound call failed: HTTP ${res.status}`);
  const body = (await res.json()) as { conversation_id?: string; callSid?: string; sip_call_id?: string };
  return body.conversation_id ?? body.sip_call_id ?? body.callSid;
}

export async function placeCall(to: string, ctx: CallContext, messenger: Messenger): Promise<CallResult> {
  const live = isLive("voice");
  let callId: string | undefined;
  if (live) {
    try {
      callId = await elevenLabsCall(to, ctx);
    } catch (err) {
      console.error("[voice]", err instanceof Error ? err.message : err);
      logActivity({ projectId: ctx.projectId, type: "call", title: "Emergency call failed", detail: "Falling back to text only.", channel: "voice", refId: ctx.refId });
      await messenger.send(to, `I tried to call you about this: ${ctx.script}`, { projectId: ctx.projectId, refId: ctx.refId });
      return { mode: "live" };
    }
  }
  logActivity({
    projectId: ctx.projectId,
    type: "call",
    title: live ? `Calling ${maskHandle(to)}` : `[mock call, no phone rang] would call ${maskHandle(to)}`,
    detail: `Script: ${ctx.script}${ctx.facts ? `\nFacts: ${ctx.facts}` : ""}`,
    channel: "voice",
    refId: ctx.refId,
  });
  // ponytail: a live call's real summary arrives later from ElevenLabs' post-call webhook (not wired); until then
  // we record what we said and follow up right away so the text thread picks up where the call left off.
  await afterCall(ctx.projectId, to, ctx.script, messenger, ctx.refId);
  return { mode: live ? "live" : "mock", callId };
}

/** Call summary -> ProjectMemory note, then the follow-up text that continues the conversation. */
export async function afterCall(projectId: string, to: string, summary: string, messenger: Messenger, refId?: string) {
  updateDb((db) => memoryFor(db, projectId).notes.push({ at: new Date().toISOString(), channel: "voice", text: `Call to ${maskHandle(to)}: ${summary}` }));
  await messenger.send(to, `As we discussed on the call: ${summary}`, { projectId, refId });
}
