import { cookies } from "next/headers";
import { GOOGLE_OAUTH_COOKIE, cookie, googleClient, sessionCookie, unsign } from "@/lib/auth";
import { webUrl } from "@/lib/server";

/** Stable number for SessionUser.id. Google's sub is a string and must not change that field. */
function idFromSub(sub: string): number {
  let h = 2166136261;
  for (let i = 0; i < sub.length; i++) {
    h ^= sub.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const n = h >>> 0;
  return n === 0 ? 1 : n;
}

function back(fail: string, next: string, error: string) {
  const page = new URL(fail === "/signup" ? "/signup" : "/login", webUrl());
  page.searchParams.set("error", error.slice(0, 200));
  page.searchParams.set("next", next);
  const headers = new Headers({ location: page.href });
  headers.append("set-cookie", cookie(GOOGLE_OAUTH_COOKIE, "", 0));
  return new Response(null, { status: 302, headers });
}

/** Google sends the user back here with ?code&state. Exchange the code, read who they are, start the session. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const pending = unsign<{ state: string; next: string; fail?: string }>((await cookies()).get(GOOGLE_OAUTH_COOKIE)?.value);
  const fail = pending?.fail === "/signup" ? "/signup" : "/login";
  const next = pending?.next ?? "/sites";
  const client = googleClient();
  const code = params.get("code");
  if (params.get("error") || !client || !code || !pending || pending.state !== params.get("state")) {
    return back(fail, next, params.get("error") === "access_denied" ? "Google sign-in was cancelled." : "Sign-in didn't match this browser. Try again.");
  }

  const token = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: client.id,
      client_secret: client.secret,
      redirect_uri: `${webUrl()}/api/auth/google/callback`,
      grant_type: "authorization_code",
    }),
  }).then((r) => r.json() as Promise<{ access_token?: string; error_description?: string }>);
  if (!token.access_token) return back(fail, next, token.error_description ?? "Google didn't sign you in.");

  // The token is used once, here, to learn who this is. It isn't stored.
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { authorization: `Bearer ${token.access_token}` } });
  const profile = (await res.json()) as { sub?: string; email?: string; name?: string; picture?: string };
  if (!res.ok || !profile.sub) return back(fail, next, "Couldn't read your Google profile.");

  const headers = new Headers({ location: next.startsWith("/") && !next.startsWith("//") ? next : "/sites" });
  headers.append("set-cookie", sessionCookie({ id: idFromSub(profile.sub), login: profile.email || profile.name || "google", avatar: profile.picture }));
  headers.append("set-cookie", cookie(GOOGLE_OAUTH_COOKIE, "", 0));
  return new Response(null, { status: 302, headers });
}
