import { proxyToOrchestrator } from "@/lib/server";

const ACTIONS = ["approve", "reject", "revise"];

export async function POST(request: Request, ctx: RouteContext<"/api/fixes/[id]/[action]">) {
  const { id, action } = await ctx.params;
  if (!ACTIONS.includes(action)) return Response.json({ error: `Unknown action "${action}"` }, { status: 404 });
  const b = await request.json().catch(() => ({}));
  if (action === "revise" && (typeof b?.instructions !== "string" || !b.instructions.trim())) {
    return Response.json({ error: "Tell Antibody what to change" }, { status: 400 });
  }
  const body = action === "revise" ? { instructions: b.instructions.trim().slice(0, 4000) } : {};
  return proxyToOrchestrator(`/fixes/${encodeURIComponent(id)}/${action}`, body);
}
