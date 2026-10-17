# Antibody

A security teammate for vibe-coded apps: it finds the holes AI coding tools leave behind, fixes them before attackers do, blocks live attacks in-request, and talks to you over iMessage and phone calls.

Current state and how to run the demo: [docs/STATUS.md](docs/STATUS.md). Conventions for agents and humans: [AGENTS.md](AGENTS.md).

## Quick start

Requires Node 24+.

```bash
npm install
cp .env.example .env.local   # fill in what you have; blanks run in mock mode
npm run dev:web              # http://localhost:3000
npm run dev:sample           # vulnerable demo app on http://localhost:4000
npm run dev:orchestrator     # iMessage loop + fixer
```

Or everything at once (web 3000, orchestrator 3001, sample 4000, shielded sample 4001; Ctrl+C stops all):

```bash
npm run dev:all
ANTIBODY_MOCK=on npm run dev:all   # force every integration to mock even if keys are set (no real texts/calls)
```

Demo loop:

```bash
# scan: open http://localhost:3000, enter http://localhost:4000, click "Fix it" on a finding
npm run attack -- --target http://localhost:4000   # every attack succeeds
npm run attack -- --target http://localhost:4001   # the shield blocks them; see /live/proj_localhost-4000
curl -XPOST localhost:3001/inbound -H "content-type: application/json" -d '{"from":"+15555550100","text":"STATUS"}'   # fake a text from the mock owner phone (mock iMessage only)
# any other number must first text "START <code>" (the code is on the project's /live page); strangers get no project info
npm run eval                                       # writes evals/results.json, shown at /evals
```

## Integrations

| Service | Status without keys | Setup |
|---|---|---|
| Photon 2.0 (iMessage, voice) | Mock: messages logged to the activity feed | [app.beta.photon.codes](https://app.beta.photon.codes) → project → API key, iMessage line |
| Chalk (shield features, evals) | Local in-memory counters | `chalk login`, then `chalk init` in `chalk/` |
| Factory Droid SDK (fixer) | Mock fixer with canned diffs | `FACTORY_API_KEY` from Factory settings |
| GitHub App (PR checks) | Disabled | Create a GitHub App, set `GITHUB_*` vars |
