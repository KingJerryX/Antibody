import { MOCK_USER, OAUTH_COOKIE, cookie, mockSignIn, newState, oauthClient, safeNext, sessionCookie, sign } from "@/lib/auth";
import { webUrl } from "@/lib/server";

/** "Sign in with GitHub". ?next= is where to land afterwards (same-site paths only). */
export async function GET(request: Request) {
  const next = safeNext(new URL(request.url).searchParams.get("next"));
  if (mockSignIn()) {
    return new Response(null, { status: 302, headers: { location: next, "set-cookie": sessionCookie(MOCK_USER) } });
  }
  const client = oauthClient();
  if (!client) return Response.json({ error: "GitHub sign-in isn't configured (GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET)." }, { status: 503 });
  // state ties the callback to this browser (CSRF), and carries where to go next.
  const state = newState();
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", client.id);
  authorize.searchParams.set("redirect_uri", `${webUrl()}/api/auth/github/callback`);
  authorize.searchParams.set("state", state);
  return new Response(null, { status: 302, headers: { location: authorize.href, "set-cookie": cookie(OAUTH_COOKIE, sign({ state, next }, 600), 600) } });
}
