# GitHub sign-in handoff

The screens are already built. Finish `route.ts` and `callback/route.ts` in this folder. Do not rebuild `/login` or `/signup`.

## What the UI calls

- Header **Log in** goes to `/login`. Header **Sign up** goes to `/signup`.
- Both screens post the browser to `GET /api/auth/github?next=/sites` (the `next` value is whatever `?next=` was on the page, default `/sites`).
- Sign up and log in are the same GitHub OAuth flow. There is no email field and no SSO button.
- `signInRedirect()` in `src/lib/auth.ts` sends people to `/login?next=<path>`, not straight to this route.
- After a session exists, the header reads `GET /api/auth/me` and shows the login. `POST /api/auth/logout` clears it.

## Contract this route already follows

Keep this behavior. The local mock path is what makes an empty `.env.local` work.

1. Read `?next=` with `safeNext()` (same-site paths only, otherwise `/sites`).
2. No `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`:
   - Local dev (`mockSignIn()` is true): set the session to `MOCK_USER` with `sessionCookie()` and `302` to `next`. Do not call GitHub.
   - Deployed (`VERCEL` set): `503` JSON `{ error: "GitHub sign-in isn't configured (GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET)." }`. Never mock a deployed session.
3. With keys: `302` to `https://github.com/login/oauth/authorize` with `client_id`, `redirect_uri` = `${webUrl()}/api/auth/github/callback`, and `state`.
4. Store `{ state, next }` in the `ab_oauth` cookie (`OAUTH_COOKIE`) via `sign()` and `cookie()`, max-age 600 seconds.
5. Callback: `state` must match the cookie. Exchange the code at `https://github.com/login/oauth/access_token`. Read `https://api.github.com/user` once. Do not store the access token.
6. Session cookie is `sessionCookie({ id: gh.id, login: gh.login, avatar: gh.avatar_url })`. `id` stays a GitHub user id number. `SessionUser` in `src/lib/auth.ts` is the shared shape. Do not change it.
7. Clear `ab_oauth`. `302` to `safeNext(pending.next)`.

## Leave these alone

- `/api/auth/google` and cookie `ab_oauth_google`. Google is a separate flow with the same session cookie format.
- The login and signup pages, and the header links to them.
- `ab_session` (`SESSION_COOKIE`) and `sessionCookie()`.
