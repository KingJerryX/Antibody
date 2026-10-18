# Antibody

Antibody is a security teammate for vibe-coded apps. Paste a URL. It scans the app, writes a fix you approve, blocks live attacks, and texts you about what happened.

Overnight notes and known issues: [docs/STATUS.md](docs/STATUS.md). Conventions for agents and humans: [AGENTS.md](AGENTS.md).

## What you need

Node 24 or newer.

```bash
npm install
cp .env.example .env.local
```

Blank keys run in mock mode. The demo works with an empty `.env.local`.

If keys are already filled in, force mock mode so nothing sends a real text or call:

```bash
ANTIBODY_MOCK=on npm run dev:all
```

On PowerShell: `$env:ANTIBODY_MOCK="on"; npm run dev:all`.

## Start the demo

From the repo root:

```bash
ANTIBODY_MOCK=on npm run dev:all
```

Ctrl+C stops all four processes.

| Process | URL |
|---|---|
| Web app | http://localhost:3000 |
| Orchestrator | http://localhost:3001 |
| Sample app (open) | http://localhost:4000 |
| Same app, behind the shield | http://localhost:4001 |

To start one process: `npm run dev:web`, `npm run dev:orchestrator`, `npm run dev:sample`, or `npm run dev:shielded`.

Optional second sample, not started by `dev:all`: `npm run dev:guestlist` on http://localhost:4020.

## Walk through it

Do these in order. Leave the four processes running.

1. **Scan.** Open http://localhost:3000, paste `http://localhost:4000`, and scan. The report is at `/report/<scanId>`.
2. **Fix.** On a finding, click **Fix it**. Review the patch at `/fix/<fixId>`, then approve, reject, or ask for changes.
3. **Attack the open app.** In a second terminal:

   ```bash
   npm run attack -- --target http://localhost:4000
   ```

   These requests get through.

4. **Attack the shielded app.**

   ```bash
   npm run attack -- --target http://localhost:4001
   ```

   The shield blocks them. Refresh http://localhost:3000/live/proj_localhost-4000 to see the blocks.

5. **Score it.** This hits the deployed NoteNest, not ports 4000 and 4001:

   ```bash
   npm run eval
   ```

   Results land in `evals/results.json` and on http://localhost:3000/evals. The same button on /evals runs it from the server.

One script at a time: `node --import tsx attacks/<name>.ts --target http://localhost:4001`. Scripts live in `attacks/` (`chat-flood`, `cred-stuff`, `idor-enumerate`, `leak-supabase`, `scrape`).

Attack scripts and active scans only run against hosts in `ANTIBODY_VERIFIED_DOMAINS` (localhost on ports 4000, 4001, and 4020, plus the deployed NoteNest).

## Text the agent

Mock mode only. The default owner is `+15555550100`.

```bash
curl -X POST localhost:3001/inbound \
  -H "content-type: application/json" \
  -d '{"from":"+15555550100","text":"STATUS"}'
```

| Text | What it does |
|---|---|
| `STATUS` | Latest scan and blocks |
| `YES fix_xxxx` | Approve that fix |
| `UNDO` | Reverse the last action |
| `START <code>` | Link a phone to a project |

The START code is on that project's Live page, under the phone. Any number other than the default owner has to send `START <code>` first. A bare `YES` or `ok` asks which fix. Merges, deletes, and key rotation are refused by text.

## Repo

| Path | What |
|---|---|
| `apps/web` | Next.js site: scan, report, fix review, live activity |
| `apps/orchestrator` | iMessage loop, approvals, fixer, GitHub webhooks |
| `packages/core` | Shared types and the store (`data/db.json`, or Supabase when keyed) |
| `packages/scanner` | URL scan engine |
| `packages/shield` | In-request blocking. If Chalk is unreachable, the request is allowed |
| `samples/vuln-app` | Vulnerable demo app, ports 4000 and 4001 |
| `samples/guestlist` | Second vulnerable sample, port 4020 |
| `attacks/` | Attack scripts. Verified hosts only |
| `evals/` | Eval sets and the scoreboard |
| `chalk/` | Chalk feature definitions. Setup: [chalk/README.md](chalk/README.md) |

Checks: `npm test` and `npm run typecheck`.

## Keys

`ANTIBODY_MOCK=auto` (the default) mocks any integration whose keys are blank. `on` mocks everything. `off` fails instead of mocking.

| Service | With no keys |
|---|---|
| Photon (iMessage and voice) | Messages are logged on the Live page |
| ElevenLabs (calls) | A call is logged. No real call is placed |
| Chalk (shield scoring) | Local counters decide |
| Factory Droid (fixer) | Canned diffs. `npm run droid:check` tests a real key |
| GitHub | Sign-in is mocked. Approvals do not open a pull request |
| Google sign-in | Same mock user as GitHub |
| Vercel | Nothing is imported |
| Supabase | Store stays in `data/db.json` |
| xAI | Repo review uses pattern checks only |

Copy names from [.env.example](.env.example). Do not commit `.env.local`.
