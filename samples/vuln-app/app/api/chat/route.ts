import { NextResponse } from "next/server";
import { chargeChat } from "@/lib/state.ts";

// VULN (no rate limit): every POST "calls the LLM" and increments a real-money spend counter.
// Nothing throttles per-IP or per-user, so a loop here runs the owner's bill up with no ceiling.
export async function POST(req: Request) {
  let prompt = "";
  try {
    prompt = (await req.json())?.prompt ?? "";
  } catch {
    // ignore bad body
  }
  // Pretend to call an LLM.
  const { aiSpend, chatCalls } = chargeChat();
  const reply = `NoteNest AI: here's a summary of "${String(prompt).slice(0, 60)}" — looks good!`;
  return NextResponse.json({ reply, aiSpend, chatCalls });
}
