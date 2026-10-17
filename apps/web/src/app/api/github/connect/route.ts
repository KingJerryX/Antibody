import { readDb } from "@antibody/core";

/** Header and scan-form entry. Attaches GitHub to the newest project, or starts a fresh install. */
export async function GET(request: Request) {
  const db = await readDb();
  const project = [...db.projects].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const next = new URL("/api/github/new", request.url);
  if (project) next.searchParams.set("project", project.id);
  return Response.redirect(next, 302);
}
