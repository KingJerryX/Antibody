// Shared helpers for the attack scripts. The one rule that matters: an attack may ONLY run against
// a host listed in ANTIBODY_VERIFIED_DOMAINS (our own apps). Everything else is refused, loudly.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Read ANTIBODY_VERIFIED_DOMAINS from env, falling back to the repo-root .env.local. */
export function verifiedDomains(): string[] {
  let raw = process.env.ANTIBODY_VERIFIED_DOMAINS;
  if (!raw) {
    let dir = process.cwd();
    for (;;) {
      const envPath = join(dir, ".env.local");
      if (existsSync(envPath)) {
        const m = readFileSync(envPath, "utf8").match(/^ANTIBODY_VERIFIED_DOMAINS=(.*)$/m);
        if (m) {
          raw = m[1].trim();
          break;
        }
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return (raw ?? "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
}

/** Parse --target from argv. */
export function targetFromArgv(): string {
  const i = process.argv.indexOf("--target");
  const t = i >= 0 ? process.argv[i + 1] : undefined;
  if (!t) {
    console.error("Usage: node --import tsx attacks/<script>.ts --target http://localhost:4000");
    process.exit(2);
  }
  return t;
}

/**
 * Resolve + authorize the target. Exits the process if the host isn't verified.
 * Returns the normalized origin (e.g. "http://localhost:4000").
 */
export function requireVerifiedTarget(): string {
  const target = targetFromArgv();
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    console.error(`Refusing: "${target}" is not a valid URL.`);
    process.exit(2);
  }
  const allowed = verifiedDomains();
  if (!allowed.includes(url.host)) {
    console.error(
      `\nREFUSED. Host "${url.host}" is not in ANTIBODY_VERIFIED_DOMAINS.\n` +
        `Attacks may only target our own apps: ${allowed.join(", ") || "(none configured)"}.\n`,
    );
    process.exit(1);
  }
  return url.origin;
}

export async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const t0 = performance.now();
  const value = await fn();
  return { ms: Math.round(performance.now() - t0), value };
}

/** Pretty header so each script's output is easy to read in a demo. */
export function banner(name: string, origin: string): void {
  console.log(`\n=== ${name} → ${origin} ===`);
}
