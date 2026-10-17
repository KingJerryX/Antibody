import { json, readStore } from "@/lib/server";

// The orchestrator writes fixes to the shared store, so the web app reads them directly.
export async function GET(_req: Request, ctx: RouteContext<"/api/fixes/[id]">) {
  const { id } = await ctx.params;
  const fix = (await readStore()).fixes.find((f) => f.id === id);
  return fix ? json(fix) : json({ error: "Fix not found" }, 404);
}
