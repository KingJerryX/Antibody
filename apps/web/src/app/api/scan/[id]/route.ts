import { readStore } from "@/lib/server";

export async function GET(_req: Request, ctx: RouteContext<"/api/scan/[id]">) {
  const { id } = await ctx.params;
  const scan = (await readStore()).scans.find((s) => s.id === id);
  return scan ? Response.json(scan) : Response.json({ error: "Scan not found" }, { status: 404 });
}
