import { actOnFix } from "@/lib/prod-fix";
import { proxyToOrchestrator } from "@/lib/server";

const ACTIONS = ["approve", "reject", "revise"] as const;

export async function POST(request: Request, ctx: RouteContext<"/api/fixes/[id]/[action]">) {
  const { id, action } = await ctx.params;
  if (!ACTIONS.includes(action as (typeof ACTIONS)[number])) return Response.json({ error: `Unknown action "${action}"` }, { status: 404 });
  const decided = action as (typeof ACTIONS)[number];
  const b = await request.json().catch(() => ({}));
  if (decided === "revise" && (typeof b?.instructions !== "string" || !b.instructions.trim())) {
    return Response.json({ error: "Tell Antibody what to change" }, { status: 400 });
  }
  const instructions = decided === "revise" ? String(b.instructions).trim().slice(0, 4000) : undefined;

  if (process.env.VERCEL) {
    const result = await actOnFix(id, decided, instructions, b?.fix);
    if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
    return Response.json(result.fix);
  }

  return proxyToOrchestrator(`/fixes/${encodeURIComponent(id)}/${decided}`, instructions ? { instructions } : {});
}
