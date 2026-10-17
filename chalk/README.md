# Antibody on Chalk

Feature definitions for the live shield. `src/features.py` mirrors the local engine in
`packages/shield/src/engine.ts` (same windows, same thresholds, same reasons).

- **Request** (one row per API/auth request): method, path, user id read, status, plus links to
  `Session`, `Ip`, `Endpoint`. Outputs: `request.risk_score`, `request.decision`
  (`allow` / `challenge` / `block`), `request.reasons`.
- **Session**: `distinct_users_read["5m"]`, `ai_calls["1m"]`.
- **Ip**: `request_count["1m" | "10m"]`, `failed_logins["10m"]`.
- **Endpoint** (normalized route, e.g. `/api/users/:id`): `request_count["1m" | "1h"]`.

How the shield uses it today: the shield computes the windows at the edge and passes them as inputs
(`request.session_distinct_users_5m`, `request.ip_route_rpm`, ...). Chalk's `score_request` resolver
turns them into the decision. The Session/Ip/Endpoint windowed features are ready for when request
events stream into Chalk (see the last section). They return `0` until then.

Project: `cmvbxnw2o00j6010n3lqfczrl`, environment: `nynmb961fd0e`.

## 1. Log in and initialise (once)

From PowerShell, in this folder (`chalk/`):

```powershell
$chalk = "$env:USERPROFILE\.chalk\bin\chalk.exe"
& $chalk login                      # opens the browser; approve access
& $chalk environment nynmb961fd0e   # make the project's environment active
Copy-Item README.md README.antibody.md   # init writes its own README.md
& $chalk init                       # creates chalk.yaml, pyproject.toml, .chalkignore; runs uv sync
```

`chalk init` may add example feature files under `src/`. Delete any that redefine `Request`,
`Session`, `Ip` or `Endpoint`. Keep `src/features.py`. Restore this README afterwards
(`Move-Item -Force README.antibody.md README.md`).

## 2. Check, deploy, try it

```powershell
& $chalk apply --plan                 # validation only, no deploy
& $chalk apply --branch antibody-dev  # optional: deploy to a throwaway branch first (~5 s)
& $chalk apply --await                # deploy to the environment
& $chalk query --in request.id=r1 --in request.session_distinct_users_5m=6 `
  --in request.session_user_read_span_s=20 --in request.ip_route_rpm=6 `
  --in request.ip_failed_logins_10m=0 --in request.ip_login_attempts_10m=0 `
  --in request.session_ai_calls_1m=0 --out request.risk_score --out request.decision --out request.reasons
```

The query should print `risk_score 1.0`, `decision "block"` and the reason
"this session read 6 different users' profiles in 20s; normal is 1".

## 3. Turn the shield's Chalk path on

Create client credentials in the Chalk dashboard (Settings → Access tokens; the token needs
online query access). Then fill these in the repo root `.env.local`:

| Var | Value |
|---|---|
| `CHALK_CLIENT_ID` | the token's client id |
| `CHALK_CLIENT_SECRET` | the token's client secret |
| `CHALK_ENVIRONMENT` | `nynmb961fd0e` (already set) |
| `CHALK_API_SERVER` | `https://api.chalk.ai` (already set) |

With both id and secret set, the shield logs `[shield] Chalk mode` and every protected request
runs an online query with a **150 ms** timeout. Any error or timeout falls back to the local
engine for that request (`source: "local"`, with a "Chalk unavailable" reason) and skips Chalk for
30 s, so the app never waits on a dead feature store and the shield keeps blocking. With either
one blank, it logs `[shield] MOCK` and uses the local engine (`source: "local"`). The first query
also exchanges credentials, so the first request or two may be decided locally.

## Local syntax check (no login needed)

```bash
cd chalk
uv run --python 3.12 --with chalkpy python -c "import sys; sys.path.insert(0, 'src'); import features as f; print(f.score(6, 20, 6, 0, 0, 0))"
```

## Streaming request events (next step)

To make `Session` / `Ip` / `Endpoint` windows real inside Chalk, add a stream source (Kafka,
Kinesis or PubSub integration in the dashboard) and a `@stream` resolver that maps each event to
a `Request` row. The shield would then publish one event per request, and `score_request` could
read `Request.session.distinct_users_read["5m"]` instead of the edge-computed inputs.
