// Runs every attack script against one target: node --import tsx attacks/all.ts --target http://localhost:4000
// Each script enforces ANTIBODY_VERIFIED_DOMAINS itself; we check up front too so nothing runs on a refused host.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { requireVerifiedTarget } from "./_lib.ts";

const origin = requireVerifiedTarget();
const here = dirname(fileURLToPath(import.meta.url));
const scripts = readdirSync(here).filter((f) => f.endsWith(".ts") && !f.startsWith("_") && f !== "all.ts");

for (const f of scripts) {
  spawnSync(process.execPath, ["--import", "tsx", join(here, f), "--target", origin], { stdio: "inherit" });
}
