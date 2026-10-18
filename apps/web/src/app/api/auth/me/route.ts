import { readDb } from "@antibody/core";
import { currentUser, mockSignIn, oauthClient } from "@/lib/auth";

/** For the header and scan form: who's signed in, whether signing in is possible here, and whether GitHub is connected. */
export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  // Connected = one of your sites has the Antibody GitHub App installed on its repo.
  const github = user ? (await readDb()).projects.some((p) => p.ownerId === user.id && p.githubInstallationId) : false;
  return Response.json({ user: user ?? null, signIn: oauthClient() ? "github" : mockSignIn() ? "mock" : "off", github });
}
