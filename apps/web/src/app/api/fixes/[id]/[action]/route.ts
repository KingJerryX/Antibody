import { json, proxyToOrchestrator } from "@/lib/server";

const ACTIONS = ["approve", "reject", "revise"];

export async function POST(request: Request, ctx: RouteContext<"/api/fixes/[id]/[action]">) {
  const { id, action } = await ctx.params;
  if (!ACTIONS.includes(action)) return json({ error: `Unknown action "${action}"` }, 404);
  const b = await request.json().catch(() => ({}));
  if (action === "revise" && (typeof b?.instructions !== "string" || !b.instructions.trim())) {
    return json({ error: "Tell Antibody what to change" }, 400);
  }
  const body = action === "revise" ? { instructions: b.instructions.trim().slice(0, 4000) } : {};
  return proxyToOrchestrator(`/fixes/${encodeURIComponent(id)}/${action}`, body);
}
