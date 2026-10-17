#!/bin/sh
# Boot script for the orchestrator on a Chalk scaling group (node:22-bookworm image).
# The group's entrypoint clones the repo and runs this; keys arrive as env vars from Chalk secrets.
set -e
cd "$(dirname "$0")/../.."

# Droid CLI (the SDK spawns `droid` from PATH) and Semgrep (the code audit and the fix's second review).
npm i -g droid@0 --no-audit --no-fund --loglevel=error
apt-get -qq update && apt-get -qq install -y --no-install-recommends python3-pip >/dev/null
pip3 install -q --break-system-packages semgrep

npm ci --no-audit --no-fund --loglevel=error
exec node --import tsx apps/orchestrator/src/index.ts
