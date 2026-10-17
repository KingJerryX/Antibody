import { cookies } from "next/headers";
import { OAUTH_COOKIE, cookie, oauthClient, safeNext, sessionCookie, unsign } from "@/lib/auth";
import { webUrl } from "@/lib/server";

/** GitHub sends the user back here with ?code&state. Exchange the code, read who they are, start the session. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const client = oauthClient();
  const pending = unsign<{ state: string; next: string }>((await cookies()).get(OAUTH_COOKIE)?.value);
  const code = params.get("code");
  if (!client || !code || !pending || pending.state !== params.get("state")) {
    return Response.json({ error: "Sign-in didn't match this browser. Try signing in again." }, { status: 400 });
  }
  const token = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ client_id: client.id, client_secret: client.secret, code, redirect_uri: `${webUrl()}/api/auth/github/callback` }),
  }).then((r) => r.json() as Promise<{ access_token?: string; error_description?: string }>);
  if (!token.access_token) return Response.json({ error: token.error_description ?? "GitHub didn't sign you in." }, { status: 400 });

  // The token is used once, here, to learn who this is. It isn't stored.
  const res = await fetch("https://api.github.com/user", { headers: { authorization: `Bearer ${token.access_token}`, accept: "application/vnd.github+json" } });
  const gh = (await res.json()) as { id?: number; login?: string; avatar_url?: string };
  if (!res.ok || typeof gh.id !== "number" || !gh.login) return Response.json({ error: "Couldn't read your GitHub profile." }, { status: 502 });

  const headers = new Headers({ location: safeNext(pending.next) });
  headers.append("set-cookie", sessionCookie({ id: gh.id, login: gh.login, avatar: gh.avatar_url }));
  headers.append("set-cookie", cookie(OAUTH_COOKIE, "", 0));
  return new Response(null, { status: 302, headers });
}
