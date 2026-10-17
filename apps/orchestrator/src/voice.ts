// Emergency phone calls: ElevenLabs voice agent dialing out through the Photon SIP trunk, or a mock.
import { logActivity, memoryFor, updateDb } from "@antibody/core";
import { isLive, maskHandle } from "./integrations.ts";
import type { Messenger } from "./messenger.ts";

export interface CallContext {
  projectId: string;
  /** What the agent opens with, in plain English. */
  script: string;
  refId?: string;
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
      // `facts` stays defined (empty) in case the agent's prompt references {{facts}}.
      conversation_initiation_client_data: { dynamic_variables: { opening: ctx.script, facts: "" } },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs outbound call failed: HTTP ${res.status}`);
  const body = (await res.json()) as { conversation_id?: string; callSid?: string; sip_call_id?: string };
  return body.conversation_id ?? body.sip_call_id ?? body.callSid;
}

export async function placeCall(to: string, ctx: CallContext, messenger: Messenger): Promise<void> {
  const live = isLive("voice");
  if (live) {
    try {
      console.log(`[voice] call started: ${(await elevenLabsCall(to, ctx)) ?? "no call id returned"}`);
    } catch (err) {
      console.error("[voice]", err instanceof Error ? err.message : err);
      await logActivity({ projectId: ctx.projectId, type: "call", title: "Emergency call failed", detail: "Falling back to text only.", channel: "voice", refId: ctx.refId });
      await messenger.send(to, `I tried to call you about this: ${ctx.script}`, { projectId: ctx.projectId, refId: ctx.refId });
      return;
    }
  }
  await logActivity({
    projectId: ctx.projectId,
    type: "call",
    title: live ? `Calling ${maskHandle(to)}` : `[mock call, no phone rang] would call ${maskHandle(to)}`,
    detail: `Script: ${ctx.script}`,
    channel: "voice",
    refId: ctx.refId,
  });
  // ponytail: a live call's real summary arrives later from ElevenLabs' post-call webhook (not wired); until then
  // we record what we said and follow up right away so the text thread picks up where the call left off.
  await updateDb((db) => memoryFor(db, ctx.projectId).notes.push({ at: new Date().toISOString(), channel: "voice", text: `Call to ${maskHandle(to)}: ${ctx.script}` }));
  await messenger.send(to, `As we discussed on the call: ${ctx.script}`, { projectId: ctx.projectId, refId: ctx.refId });
}
