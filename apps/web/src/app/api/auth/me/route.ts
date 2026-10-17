import { currentUser, mockSignIn, oauthClient } from "@/lib/auth";

/** For the header: who's signed in, and whether signing in is possible here. */
export async function GET() {
  return Response.json({ user: (await currentUser()) ?? null, signIn: oauthClient() ? "github" : mockSignIn() ? "mock" : "off" });
}
