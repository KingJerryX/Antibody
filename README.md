# Antibody

Antibody is a security teammate for vibe-coded apps. Paste a URL. It scans the app, writes a fix you approve, blocks live attacks, and texts you about what happened.

Live: https://antibody-ky3j.vercel.app. Conventions for agents and humans: [AGENTS.md](AGENTS.md).

## How it works

1. **Scan.** Paste a URL. The report lists every check as passed, failed, or not run, so a partial scan never looks clean.
2. **Connect.** Sign in with GitHub, install the Antibody GitHub App on the site's repo, and connect the Vercel project that hosts it. The repo unlocks the code checks and fixes. Vercel proves you own the site, which unlocks the live checks.
3. **Fix.** Click **Fix it**. Factory's Droid writes the smallest fix in a throwaway clone of your repo. Antibody then checks it itself before you see it:
   - starts the patched copy and repeats the probe that found the hole, which must now be refused;
   - compares the copy's other pages and routes with your live site;
   - re-runs Semgrep on the patched code and keeps the diff under 120 lines.
4. **Approve.** Approve on the fix page or reply `YES <fixId>` by text. Antibody opens a pull request. It never merges: you review and merge in GitHub.
5. **Shield.** `@antibody/shield` sits in front of a protected app's API and auth routes. Chalk scores each request (allow, slow down, or block) in about a tenth of a second. If Chalk is slow or unreachable, the same rules run locally, so the app keeps working and attacks are still blocked.
6. **Alerts.** The first block of an attack texts the owner over iMessage (Photon). If nobody replies, Antibody calls through Photon's voice line to an ElevenLabs agent that explains what happened, then the text thread picks up after the call.

## What each service does

| Service | Used for |
|---|---|
| Factory Droid SDK | Writes and revises fixes in a throwaway clone. File edits only, never merges |
| Chalk | Scores shield requests (online features in [chalk/](chalk/README.md)). Hosts the orchestrator on a scaling group |
| Photon 2.0 | iMessage line: alerts, replies, `START` phone linking. SIP voice line for calls |
| ElevenLabs | Voice agent on the calls. It only states the facts Antibody passes in |
| GitHub | Sign-in (OAuth), plus the Antibody GitHub App for repo access and pull requests |
| Vercel | Hosts the website. The Antibody Vercel integration proves site ownership |
| Supabase | Shared store when the website and orchestrator run on different hosts |
| Semgrep, xAI | Code review of a connected repo |

## Run it locally

Node 24 or newer.

```bash
npm install
cp .env.example .env.local
```

Blank keys run in mock mode, so the demo works with an empty `.env.local`. If keys are filled in, force mock mode so nothing sends a real text or call:

```bash
ANTIBODY_MOCK=on npm run dev:all
```

On PowerShell: `$env:ANTIBODY_MOCK="on"; npm run dev:all`. Ctrl+C stops all four processes.

| Process | URL | Start alone |
|---|---|---|
| Website | http://localhost:3000 | `npm run dev:web` |
| Orchestrator | http://localhost:3001 | `npm run dev:orchestrator` |
| Sample app (open) | http://localhost:4000 | `npm run dev:sample` |
| Same app, behind the shield | http://localhost:4001 | `npm run dev:shielded` |

Optional second sample, not started by `dev:all`: `npm run dev:guestlist` on http://localhost:4020.

## Walk through it

Leave the four processes running.

1. **Scan.** Open http://localhost:3000, paste `http://localhost:4000`, and scan. The report is at `/report/<scanId>`.
2. **Fix.** On a finding, click **Fix it**. Review the patch and its checks at `/fix/<fixId>`, then approve, reject, or ask for changes. The local sample needs no GitHub connection.
3. **Attack the open app.** In a second terminal: `npm run attack -- --target http://localhost:4000`. These requests get through.
4. **Attack the shielded app.** `npm run attack -- --target http://localhost:4001`. The shield blocks them. See the blocks at http://localhost:3000/live/proj_localhost-4000.
5. **Score it.** `npm run eval` scans the shielded sample and replays attack and normal traffic against it. Results land in `evals/results.json` and on http://localhost:3000/evals. When Supabase is keyed, the run is also published to the deployed `/evals` page.

One script at a time: `node --import tsx attacks/<name>.ts --target http://localhost:4001`. Scripts live in `attacks/` (`chat-flood`, `cred-stuff`, `idor-enumerate`, `leak-supabase`, `scrape`).

Attack scripts and active scans only run against hosts in `ANTIBODY_VERIFIED_DOMAINS` (localhost on ports 4000, 4001, and 4020).

## Text the agent

In mock mode the default owner is `+15555550100`:

```bash
curl -X POST localhost:3001/inbound \
  -H "content-type: application/json" \
  -d '{"from":"+15555550100","text":"STATUS"}'
```

| Text | What it does |
|---|---|
| `START <code>` | Link a phone to a project. The code is on that project's Live page |
| `STATUS` | Latest scan, open fixes, and recent blocks |
| `YES <fixId>` | Approve that fix. With a connected repo, Antibody opens the pull request and texts the link |
| `UNDO` | Reverse Antibody's last action |

A bare `YES` or `ok` asks which fix. Merges, deletes, and key rotation are refused by text: merges happen in GitHub, and the rest you do yourself.

## Deploy

| Part | Where | How |
|---|---|---|
| Website | Vercel | `vercel.json` serves `apps/web`. Set the env from `.env.example` in the Vercel project |
| Orchestrator | Chalk scaling group | Image `node:22-bookworm`, port 8080. The entrypoint clones this repo and runs `apps/orchestrator/chalk-start.sh`. Keys come from Chalk secrets |
| Store | Supabase | Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on both Vercel and Chalk |

Set the same `ANTIBODY_ORCHESTRATOR_TOKEN` on Vercel, on the Chalk orchestrator, and in every app that runs the shield. The orchestrator won't listen publicly without it, and the website only accepts shield block reports that carry it.

## Repo

| Path | What |
|---|---|
| `apps/web` | Next.js 16 site: scan, report, connect, fix review, live activity, eval board, sign-in |
| `apps/orchestrator` | Texts and calls, approval policy, Droid fixer and fix verification, pull requests |
| `packages/core` | Shared types, the store (`data/db.json`, or Supabase when keyed), GitHub App helpers |
| `packages/scanner` | URL scan and code audit |
| `packages/shield` | In-request blocking. Chalk scores, with the same rules locally as a fallback |
| `samples/vuln-app` | Vulnerable demo app ("NoteNest", invented data), ports 4000 and 4001 |
| `samples/guestlist` | Second vulnerable sample, port 4020 |
| `attacks/` | Attack scripts. Verified hosts only |
| `evals/` | Eval runner, seeded holes, and the scoreboard |
| `chalk/` | Chalk feature definitions and resolver. Setup: [chalk/README.md](chalk/README.md) |

Checks: `npm test` and `npm run typecheck`.

## Keys

`ANTIBODY_MOCK=auto` (the default) mocks any integration whose keys are blank. `on` mocks everything. `off` fails instead of mocking.

| Service | With no keys |
|---|---|
| Photon (iMessage and voice) | Messages are logged on the Live page |
| ElevenLabs (calls) | A call is logged. No real call is placed |
| Chalk (shield scoring) | The local engine decides |
| Factory Droid (fixer) | Canned diffs. `npm run droid:check` tests a real key |
| GitHub | Sign-in is mocked. Approvals do not open a pull request |
| Google sign-in | Same mock user as GitHub |
| Vercel | Nothing is imported |
| Supabase | Store stays in `data/db.json` |
| xAI | Repo review uses pattern checks only |

Copy names from [.env.example](.env.example). Do not commit `.env.local`.
