# AGENTS.md

Instructions for coding agents (Droid and others) and humans working in this repo.
Product context: Antibody is a security teammate for vibe-coded apps. How to run it and what each service does: `README.md`.

## Layout

| Path | What | Run |
|---|---|---|
| `apps/web` | Next.js 16 site: landing, URL scan, report, fix review, live activity | `npm run dev:web` (port 3000) |
| `apps/orchestrator` | Node service: Photon iMessage loop, approval policy, Droid fixer, GitHub webhooks | `npm run dev:orchestrator` |
| `packages/core` | Shared types (`types.ts`) and store (`store.ts`: Supabase when keyed, else `data/db.json`) | — |
| `packages/scanner` | URL scan engine used by the web app | `npm test -w @antibody/scanner` |
| `packages/shield` | Next.js middleware for in-request blocking (Chalk + local fallback) | `npm test -w @antibody/shield` |
| `samples/vuln-app` | Deliberately vulnerable demo app | `npm run dev:sample` (port 4000) |
| `chalk/` | Chalk feature definitions (Python) | Chalk CLI: `%USERPROFILE%\.chalk\bin\chalk.exe` |
| `attacks/` | Attack scripts — only against `ANTIBODY_VERIFIED_DOMAINS` | `node attacks/<script>.ts` |
| `evals/` | Eval sets and scoreboard | — |

## Rules

- **Shared contract:** `packages/core/src/types.ts`. Don't change shapes casually; every package depends on them.
- **Env:** one `.env.local` at the repo root (template: `.env.example`). Never commit secrets or print them in logs.
- **Mock mode:** every integration (Photon, Chalk, Factory, GitHub, ElevenLabs) must work without keys by falling back to a mock and saying so in the UI/logs. The app must run end to end with an empty `.env.local`.
- **Sign-in screens are done.** `/login` and `/signup` (GitHub + Google buttons only). Do not rebuild them. GitHub OAuth contract: `apps/web/src/app/api/auth/GITHUB.md`. Google is `/api/auth/google` and uses cookie `ab_oauth_google`. Leave `SessionUser.id` a number.
- **Safety:** scans that actively probe, and attack scripts, may only target hosts in `ANTIBODY_VERIFIED_DOMAINS`. Never target anything else.
- **Fail safe:** if Chalk is slow or unreachable, the shield's local engine decides with the same rules. The shield must never error or take the app down.
- **Git:** don't commit or push unless a human asks. Cursor's `Co-authored-by` line is fine (we use Cursor for our track). No Claude co-author or "Generated with Claude Code" lines in commits or PRs.
- **Next.js 16** has breaking changes vs older versions. Read `node_modules/next/dist/docs/` before writing Next code.
- **Imports:** packages import each other as `@antibody/<name>`; relative TS imports use explicit `.ts` extensions.
- **Platform:** dev machines run Windows (Git Bash / PowerShell). Use cross-platform Node APIs, not shell-specific scripts.
- Keep it small: no new dependency when a few lines will do.
