# Antibody: morning status (2026-10-17)

Written at the end of the overnight build. Ports 3000, 3001, 4000 and 4001 are **not** running; start them yourself (section 2).

## 1. TL;DR

- **The whole demo loop works in mock mode.** Scan the sample app from the web app, read the plain-English report, click "Fix it", approve, run the attacks, watch the shield block them, and see it all on the live page with a mock iMessage thread.
- **Checks are green (re-run just now):** `npm run typecheck` exits 0, and `npm test` exits 0 with 35/35 tests passing (orchestrator 8, web 2, scanner 15, shield 7, evals 3). The integrator and fix pass also ran `npm run build -w @antibody/web` successfully; it was not re-run for this note.
- **Latest eval** (`evals/results.json`, 07:13 UTC, mode `mock` = Chalk mocked, real sample app): scanner found 6/6 planted holes with 0 false alarms; shield blocked 3/3 attacks, wrongly blocked 0/20 normal requests, about 10 requests before a block, p95 105 ms (dev server). Fixes: n/a.
- **No real external service has worked yet.** Photon, Chalk, Factory, voice and GitHub have only run as mocks. Real Photon keys are now in `.env.local` and the Photon poll answers **HTTP 403**.
- **Important:** `.env.local` has `ANTIBODY_MOCK=auto` and Photon keys filled in, so a plain `npm run dev:all` starts in **live iMessage mode**. Use `ANTIBODY_MOCK=on` until Photon is sorted out.

## 2. Run the demo locally

From the repo root, in your own terminal (a server started by an agent or background task dies when that task ends):

```bash
# Optional: start from a clean store (it is full of overnight test data)
rm data/db.json

# 1. Start web :3000, orchestrator :3001, sample app :4000, shielded copy :4001 (all bound to 127.0.0.1)
ANTIBODY_MOCK=on npm run dev:all          # Ctrl+C stops all four

# 2. In a second terminal: attacks succeed on 4000, are blocked on 4001
npm run attack -- --target http://localhost:4000
npm run attack -- --target http://localhost:4001

# 3. Refresh the eval numbers (needs 4000 and 4001 up)
npm run eval

# 4. Pretend to be the owner texting the agent (mock mode only)
curl -X POST localhost:3001/inbound -H "content-type: application/json" \
  -d '{"from":"+15555550100","text":"STATUS"}'
```

PowerShell: set the flag with `$env:ANTIBODY_MOCK="on"; npm run dev:all`.

Open, in order:
1. http://localhost:3000: paste `http://localhost:4000` and scan.
2. http://localhost:3000/report/<scanId>: findings, then click "Fix it".
3. http://localhost:3000/fix/<fixId>: review, then approve, reject or ask for changes.
4. http://localhost:3000/live/proj_localhost-4000: activity feed, block banner, iMessage thread, and the START code under the phone.
5. http://localhost:3000/evals: scoreboard.

Texting rules in mock mode: `+15555550100` is the default owner and can act on any unclaimed project. Any other number must first text `START <code>` (the code is on the project's /live page). Approvals need an explicit id: `YES fix_xxxx`. Plain "ok" or "y" only asks which fix. Merges, deletes and key rotation are always refused by text.

Single services: `npm run dev:web`, `npm run dev:orchestrator`, `npm run dev:sample`, `npm run dev:shielded`. One attack: `node --import tsx attacks/<name>.ts --target http://localhost:4001`. Attack scripts refuse any host not in `ANTIBODY_VERIFIED_DOMAINS` (localhost:4000, localhost:4001).

## 3. Real vs mocked

| Integration | State | Notes |
|---|---|---|
| Photon (iMessage) | **Mock in every test.** The live code exists but has never sent anything. | Keys are in `.env.local`, but polling `listMessages` returns 403 (key may lack `project:read`, or the project id or line is wrong). Replies use 2 s polling, not the Socket.IO feed. In live mode nothing is sent until the owner texts the agent first. |
| Chalk (shield scoring) | **Mock** (local engine) | `CHALK_CLIENT_ID` and `CHALK_CLIENT_SECRET` are blank. `chalk/src/features.py` imports with real chalkpy; nothing has been applied to the Chalk project. With credentials set, if Chalk fails or times out (150 ms), the local engine decides and Chalk is skipped for 30 s. Only tested against an unreachable fake server. |
| Factory Droid (fixer) | **Mock** | Canned diffs for all 9 finding kinds; every check reads "Simulated (mock fixer, nothing was run)". `DroidFixer` type-checks but has never run. `npm run droid:check` verifies a key once you have one. |
| Voice (calls) | **Mock** | A call logs a `call` activity, saves a voice note, and sends the "As we discussed on the call" text. The ElevenLabs outbound SIP path is untested. ElevenLabs keys and a voice number are in `.env.local`, but voice stays mock until `ELEVENLABS_PHONE_NUMBER_ID` is also set. |
| GitHub App | **Disabled** | The webhook stub checks the HMAC and logs "PR check queued". No clone, check run or PR. |

| Feature | State |
|---|---|
| Scanner, passive checks (secrets, headers, Supabase discovery) | Real, tested; runs on any host. |
| Scanner, active checks (Supabase RLS, open routes, IDOR, rate limit) | Real; verified hosts only (the Supabase host must be verified too); active probes don't follow redirects. |
| Shield in the sample app (`proxy.ts`, port 4001) | Real local engine with plain-English reasons. |
| Web pages: landing, report, fix, live, evals | Real; tested in the browser against the mock orchestrator. |
| Approve by text, START codes, interrupt budget, quiet hours, escalation call | Real logic, exercised only through the mock `/inbound` route. |
| Text commands RATE LIMIT / BLOCK / WATCH | Recorded only. The shield doesn't read them. |
| Digests and quiet-hours holds | Logged only; nothing sends them later. |
| Evals `fixes` section | Stub: always `{attempted: 0, passed: 0}`, shown as n/a. |
| Sample app AI chat and Supabase | Fake: chat bumps an "AI spend" counter; Supabase is a tiny PostgREST mimic. All leaked keys are obvious fakes. |

## 4. Morning checklist (in order)

1. **Photon.** The key, project id, agent handle and test sender are already in `.env.local`, but the poll returns 403. In https://app.beta.photon.codes check that the key has `project:read` + `project:write`, that `PHOTON_PROJECT_ID` matches, and that the iMessage line is assigned. Then start with `ANTIBODY_MOCK=auto` once, text the agent from your phone first, and confirm one real reply before the demo.
2. **Chalk.** In `chalk/`: `chalk login`, then `chalk environment nynmb961fd0e`, then `chalk apply --await` (full steps in `chalk/README.md`). `chalk.yaml` and `pyproject.toml` already exist from an earlier `chalk init`, so don't re-run init unless you mean to overwrite them. Fill `CHALK_CLIENT_ID` and `CHALK_CLIENT_SECRET`. For the syntax check use `uv run --no-project ...`; a bare `uv run` tries to build the project and fails on Windows.
3. **Factory.** When credits arrive, set `FACTORY_API_KEY`, run `npm run droid:check`, then click "Fix it" once to get a real Droid fix against `samples/vuln-app`.
4. **Voice (costs credits, decide first).** Decide whether to buy a Photon SMS number with a voice profile and use the ElevenLabs agent. If yes, import the number into ElevenLabs and set `ELEVENLABS_PHONE_NUMBER_ID`. That variable is missing from `.env.example`; add it there too.
5. **GitHub App.** Create it, set `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY_PATH`, `GITHUB_WEBHOOK_SECRET`. Even then, only the webhook stub exists; opening PRs is still to build.

## 5. Known issues and next steps (by demo impact)

1. **Live Photon by default.** Covered above: without `ANTIBODY_MOCK=on`, the orchestrator goes live with keys that get 403.
2. **The fix page promises a PR that never opens.** `apps/web/src/app/fix/[id]/FixView.tsx` lines 161 and 181 say approving opens a pull request. Nothing creates one. When `fix.prUrl` is empty, say "Approved. Mock mode: no pull request opened (GitHub not connected)."
3. **Attacks lock out the presenter's browser on :4001.** Attack scripts send no `x-forwarded-for`, so they share the "local" IP with your browser, and your own `/api/*` requests to :4001 can get 429 for up to 10 minutes. Fix: send a fixed attacker IP (e.g. `203.0.113.66`) in `attacks/_lib.ts`. Workaround: restart :4001 between rehearsals.
4. **Only one block row per attack run.** Blocks are reported once per actor per 10 s (`packages/shield/src/index.ts` line 152), so all 5 attacks add a single row on /live. Throttle per actor and route. Eval runs also post blocks under `proj_localhost-4000` and inflate its "Attacks blocked" count; give the eval its own project id.
5. **Duplicate fixes.** Each "Fix it" click creates a new proposal even if one is ready. `startFix` in `apps/orchestrator/src/index.ts` should return the existing drafting or ready fix for that finding.
6. **Rejected fixes show as "Approved" on /live.** Rejections are logged with type `approval` (`apps/orchestrator/src/index.ts` line 180). Use a generic "Decision" label or derive it from the title.
7. **Stranger texts clutter the demo thread.** Strangers get no project data, but their texts and our "not linked" replies are logged on the newest project's /live phone.
8. **Eval numbers are soft.** Each of the 20 "normal" visitors makes one request from its own IP, so 0% wrongly blocked is guaranteed by construction. Attacker session cookies are fixed, so `requestsBeforeBlock` drifts between runs (7 to 10). Model normal users as multi-request sessions and randomize attacker cookies. p95 includes Next dev compile time.
9. **`attacks/leak-supabase.ts` fetches absolute script URLs on any host** (line 14). These are GETs only, but they should be limited to the target origin.
10. **Messy `data/db.json`.** Overnight scans, fixes, texts, START codes, and fake teammates (e.g. `+15555550777` on proj_localhost-4001) are in it. Delete it before the demo.
11. **Smaller limits** (marked with `ponytail:` comments): the orchestrator has no auth token and relies on 127.0.0.1 plus a JSON content-type check; escalation timers live in memory; the shield's engine is per process; reply routing matches the last 4 digits of a number; `/api/events` has no auth; `evals/` isn't an npm workspace, so use `npm run eval`; the report score is a simple severity-weighted heuristic.
12. **Optional type field:** `ProjectMemory.startCode?` was added to `packages/core/src/types.ts`. `evals/results.json` also has an extra `target` field.

Next steps after the checklist: get one real Photon round trip, apply the Chalk features and flip the shield to Chalk, run one real Droid fix and count it in evals, make the shield read RATE LIMIT/BLOCK text decisions, and move Photon receiving to the Socket.IO feed.
