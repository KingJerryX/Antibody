import { json, readStore } from "@/lib/server";

export async function GET(_req: Request, ctx: RouteContext<"/api/scan/[id]">) {
  const { id } = await ctx.params;
  const scan = (await readStore()).scans.find((s) => s.id === id);
  return scan ? json(scan) : json({ error: "Scan not found" }, 404);
}
