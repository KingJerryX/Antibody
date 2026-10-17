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
  return NextResponse.json({ reply: fakeModel(String(prompt)), aiSpend, chatCalls });
}

/** Canned "model": the client sends "<question>\n\n<title>: <body>". Good enough to look real on stage. */
function fakeModel(prompt: string): string {
  const [question, ...rest] = prompt.split("\n\n");
  const note = rest.join("\n\n");
  const items = note.split("\n").filter((l) => l.trim().startsWith("- ")).map((l) => l.trim().slice(2));
  if (/to-?do/i.test(question)) {
    const todos = items.length ? items : note.split(/[.\n]/).map((s) => s.trim()).filter(Boolean).slice(1, 5);
    return todos.length ? `Here's your to-do list:\n${todos.map((t) => `☐ ${t}`).join("\n")}` : "There's nothing actionable in this note yet.";
  }
  const [title, ...body] = note.split(": ");
  const gist = body.join(": ").split(/\n|\. /).find((s) => s.trim())?.trim();
  if (!gist) return "This note is empty. Write something and I'll summarize it.";
  return `${title.trim()} in one line: ${gist.replace(/\.$/, "")}.${items.length ? ` It has ${items.length} open items.` : ""}`;
}
