import { readDb } from "@antibody/core";
import { currentUser, signInRedirect } from "@/lib/auth";

/** Header and scan-form "Connect GitHub": your newest project, or a fresh install if you have none. */
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return signInRedirect(request);
  const mine = (await readDb()).projects.filter((p) => p.ownerId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const next = new URL("/api/github/new", request.url);
  if (mine[0]) next.searchParams.set("project", mine[0].id);
  return Response.redirect(next, 302);
}
