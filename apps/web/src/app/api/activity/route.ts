import { readStore } from "@/lib/server";

/** Oldest first, last 200 events for the project. */
export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId) return Response.json({ error: "projectId is required" }, { status: 400 });
  const events = (await readStore()).activity.filter((e) => e.projectId === projectId);
  events.sort((a, b) => a.at.localeCompare(b.at));
  return Response.json(events.slice(-200));
}
