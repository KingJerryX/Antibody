# Security coverage: what Antibody checks, detects and fixes

Reference for deciding which checks to build next. Organized by the [OWASP Top 10:2025](https://owasp.org/Top10/2025/0x00_2025-Introduction/), plus API, AI-app and abuse risks that matter for vibe-coded apps.

For each risk:
- **Check** — how Antibody confirms it, on apps the owner has verified. Code-level checks run at connect and on every PR; behavior checks run against preview deploys.
- **Shield** — the live signal (a Chalk feature) that catches it in-request.
- **Fix** — the change Droid proposes, for a Next.js + Supabase app.
- **Status** — ✅ built · 🟡 partial · ⬜ not yet.

## 0. Ground rules for every check

Antibody's checks are verification, not attacks on strangers:

- **Owned targets only.** Behavior checks run only against hosts in `ANTIBODY_VERIFIED_DOMAINS`, which require GitHub App install plus domain verification. Unverified hosts get passive checks only: one page load plus its same-origin scripts, like a browser visit.
- **Preview first.** Behavior checks run against Vercel preview deploys, not production.
- **Harmless by construction.** Checks read, never write or delete. Where a check needs input, it uses a unique harmless marker (e.g. `antibody-canary-7f3a`) and looks for how the app handles it. No real payloads, no data changes.
- **Low and slow.** Rate-capped, with a hard request budget per check.
- **Proof, not guesses.** A finding is only reported with evidence, and every fix ships with a test that fails before and passes after.

## 1. OWASP Top 10:2025

### A01 Broken Access Control (incl. SSRF) — the #1 vibe-coding risk

| Variant | Check | Shield | Fix | Status |
|---|---|---|---|---|
| Users reading/editing other users' records (IDOR / BOLA) | With two test accounts, request account B's record id as account A; expect 403/404 | `session.distinct_user_ids_5m` far above normal | Scope every query by the session user; Supabase RLS `auth.uid() = user_id` | ✅ scan + shield |
| Supabase table readable/writable with the public anon key (RLS off) | Read-only `select limit 5` with the anon key found in the bundle | Reads of whole tables via REST from one actor | `alter table … enable row level security` + per-user policies | ✅ scan |
| Admin pages / API routes with no auth | Request `/admin`, `/api/admin/*` with no session | Unauthenticated hits on admin routes | Server-side auth + role check in the route handler / proxy | ✅ scan |
| Auth checked only in the UI (hidden button, open API) | Call the API route directly without the UI | Same as above | Move checks into server code; never trust the client | 🟡 (covered by route probe) |
| Privilege escalation via a client-sent `role` / `isAdmin` field | PR check: flag writes that copy request body fields into role columns | Role changes on accounts | Allow-list writable fields; roles only set server-side | ⬜ |
| SSRF (server fetches a user-supplied URL) | PR check: flag `fetch(userInput)` in server code | Outbound requests to internal/metadata IPs | URL allow-list; block private IP ranges | ⬜ |
| CORS `*` with credentials | Read response headers | — | Explicit origin allow-list | ⬜ |

### A02 Security Misconfiguration

| Variant | Check | Shield | Fix | Status |
|---|---|---|---|---|
| Missing security headers (CSP, frame-ancestors, HSTS, nosniff) | Read response headers | — | `headers()` in `next.config` | ✅ scan |
| Debug output / stack traces / source maps in production | Look for verbose error bodies and public `.map` files | Error-rate spikes | Generic errors; `productionBrowserSourceMaps: false` | ⬜ |
| Exposed files (`.env`, `.git/`, backups) | Request well-known paths, read status only | Hits on these paths | Block in hosting config; never deploy them | ⬜ |
| Supabase storage buckets public by accident | List bucket policy via the Supabase connection | Bulk file downloads | Private buckets + signed URLs | ⬜ |
| Default/verbose framework settings | Config review at connect | — | Harden config | ⬜ |

### A03 Software Supply Chain Failures

| Variant | Check | Shield | Fix | Status |
|---|---|---|---|---|
| Known-vulnerable dependencies | `npm audit` / advisory DB on the lockfile at connect and per PR | — | Bump to patched version (Droid PR) | ⬜ |
| AI-hallucinated or typosquatted package names | PR check: new deps that are brand-new, low-download, or near-miss names | — | Replace with the intended package | ⬜ |
| Unpinned versions / missing lockfile | Repo check | — | Commit the lockfile; pin | ⬜ |
| Scripts from random CDNs without integrity | Scan HTML for third-party `<script>` without SRI | — | Self-host or add `integrity` | ⬜ |

### A04 Cryptographic Failures

| Variant | Check | Shield | Fix | Status |
|---|---|---|---|---|
| Secret keys in the client bundle (OpenAI, Stripe, Supabase service_role, AWS, Anthropic) | Passive bundle scan; redacted evidence | Spike in usage of that provider (cost) | Move to server env; rotate the key | ✅ scan |
| Secrets committed to the repo | Repo history scan at connect | — | Remove + rotate | ⬜ |
| No HTTPS / mixed content | Check scheme and redirects | — | Force HTTPS, HSTS | 🟡 (HSTS header only) |
| Passwords stored in plain text / weak hashing (custom auth) | PR check for password columns without a hash step | — | Use Supabase Auth or a proper hash (argon2/bcrypt) | ⬜ |
| Insecure cookies (no `Secure`/`HttpOnly`/`SameSite`) | Read `Set-Cookie` headers | — | Set cookie flags | ⬜ |

### A05 Injection

| Variant | Check | Shield | Fix | Status |
|---|---|---|---|---|
| SQL injection via string-built queries | PR/code check: raw SQL built from request input; behavior check with a harmless marker to see if input reaches a query unparameterized (error-shape change only) | Error spikes on one route from one actor | Parameterized queries / query builder | 🟡 (type exists, no check) |
| Cross-site scripting (XSS) | Code check: `dangerouslySetInnerHTML` with user data; behavior check: submit a harmless marker and see if it comes back unescaped | — | Render as text; sanitize HTML with an allow-list; add CSP | 🟡 (type exists, no check) |
| Command injection | Code check: `exec`/`spawn` with request input | — | Avoid shell; pass args as an array | ⬜ |
| Prompt injection (see §3) | — | — | — | ⬜ |

### A06 Insecure Design

| Variant | Check | Shield | Fix | Status |
|---|---|---|---|---|
| Business-logic abuse (reuse a coupon, negative quantities, skip payment step) | Hard to scan; owner describes rules in chat, Droid writes a test for each rule | Unusual sequences per actor (e.g. same coupon 50×) | Server-side invariants + idempotency keys | ⬜ (layer 5 demo) |
| No rate limit on expensive endpoints (AI, email, SMS) | Short, capped burst against a preview; expect 429 | `endpoint.ai_spend_per_min`, requests/min per actor | Per-user and per-IP rate lim