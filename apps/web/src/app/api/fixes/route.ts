import { proxyToOrchestrator } from "@/lib/server";

export async function POST(request: Request) {
  const b = await request.json().catch(() => null);
  if (typeof b?.findingId !== "string" || !b.findingId) return Response.json({ error: "findingId is required" }, { status: 400 });
  return proxyToOrchestrator("/fixes", { findingId: b.findingId });
}
