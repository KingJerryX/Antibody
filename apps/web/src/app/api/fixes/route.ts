import { json, proxyToOrchestrator } from "@/lib/server";

export async function POST(request: Request) {
  const b = await request.json().catch(() => null);
  if (typeof b?.findingId !== "string" || !b.findingId) return json({ error: "findingId is required" }, 400);
  return proxyToOrchestrator("/fixes", { findingId: b.findingId });
}
