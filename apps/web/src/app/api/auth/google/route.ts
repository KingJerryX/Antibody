import { GOOGLE_OAUTH_COOKIE, MOCK_USER, cookie, googleClient, mockSignIn, newState, safeNext, sessionCookie, sign } from "@/lib/auth";
import { webUrl } from "@/lib/server";

/** Same screen for sign up and log in. ?next= is where to land. ?fail= is /login or /signup, for a visible error. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const fail = url.searchParams.get("fail") === "/signup" ? "/signup" : "/login";
  if (mockSignIn() && !googleClient()) {
    return new Response(null, { status: 302, headers: { location: next, "set-cookie": sessionCookie(MOCK_USER) } });
  }
  const client = googleClient();
  if (!client) {
    const back = new URL(fail, webUrl());
    back.searchParams.set("error", "Google sign-in isn't configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).");
    back.searchParams.set("next", next);
    return Response.redirect(back, 302);
  }
  const state = newState();
  const authorize = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorize.searchParams.set("client_id", client.id);
  authorize.searchParams.set("redirect_uri", `${webUrl()}/api/auth/google/callback`);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", "openid email profile");
  authorize.searchParams.set("state", state);
  return new Response(null, {
    status: 302,
    headers: { location: authorize.href, "set-cookie": cookie(GOOGLE_OAUTH_COOKIE, sign({ state, next, fail }, 600), 600) },
  });
}
