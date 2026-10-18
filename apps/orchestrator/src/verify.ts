// Antibody's own checks on a Droid fix: start the patched copy and re-attack it, compare its behavior
// with the original app, and re-run Semgrep on the patched code. Droid's self-reported tests don't count.
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createServer, type AddressInfo } from "node:net";
import { dirname, join, relative } from "node:path";
import { parseEnv } from "node:util";
import { readDb, repoRoot, type Finding, type FindingKind, type FixCheck, type ReplayedResponse } from "@antibody/core";
import { auditCode, scanUrl } from "@antibody/scanner";

const START_TIMEOUT_MS = 120_000;
const INSTALL_TIMEOUT_MS = 8 * 60_000;
/** Security fixes should be small; a bigger diff needs a human's closer look. */
const MAX_DIFF_LINES = 120;
/** Kinds the scanner proves with one unauthenticated GET, so re-sending that URL is the whole attack. */
const REPLAYABLE: FindingKind[] = ["unprotected_route", "idor"];

type App = { origin: string; stop: () => Promise<void> };

/** Runs every check on the patched copy, reporting each one as soon as it settles. */
export async function verifyFix(
  finding: Finding,
  fixedDir: string,
  diffLines: number,
  filesChanged: string[],
  onCheck: (check: FixCheck) => void = () => {},
  /** A fresh clone of the owner's repo: install its own dependencies before starting it. */
  opts: { install?: boolean } = {},
): Promise<FixCheck[]> {
  const settle = (check: FixCheck) => (onCheck(check), check);
  const preview = settle({ name: "preview_replay", status: "skipped", detail: "No preview deployments in local mode." });
  const code = settle(await codeCheck(finding, fixedDir, diffLines, filesChanged));
  // A monorepo keeps its site in a subfolder (apps/web): start the Next app the changed files belong to.
  const appDir = locateApp(fixedDir, filesChanged);
  let app: App;
  try {
    if (opts.install) await installDeps(fixedDir, appDir);
    app = await startApp(appDir, fixedDir);
  } catch (err) {
    const detail = `The patched app didn't start: ${(err as Error).message}`;
    const exploit = settle({ name: "exploit_test", status: "fail", detail });
    const behavior = settle({ name: "behavior_tests", status: "fail", detail });
    return [exploit, behavior, preview, code];
  }
  try {
    const exploit = settle(await exploitTest(finding, app.origin));
    const behavior = settle(await behaviorTests(finding, appDir, app.origin));
    return [exploit, behavior, preview, code];
  } finally {
    await app.stop();
  }
}

/** Re-run the scanner's probes on the patched app; the probe that found the hole must no longer work. */
async function exploitTest(finding: Finding, patched: string): Promise<FixCheck> {
  const path = URL.parse(finding.location?.url ?? "")?.pathname;
  if (finding.detectedBy !== "url_scan" || !path) {
    return { name: "exploit_test", status: "skipped", detail: "Found in code only, so there is no live probe to re-run. See the code check." };
  }
  // The patched copy runs on a port we just opened, so it is ours to probe.
  const report = await scanUrl(`${patched}/`, { projectId: finding.projectId, verifiedDomains: [new URL(patched).host] });
  if (report.status === "error") return { name: "exploit_test", status: "fail", detail: `Couldn't re-run the probe: ${report.error}` };
  const still = report.findings.find((f) => f.kind === finding.kind && URL.parse(f.location?.url ?? "")?.pathname === path);
  const { pathname, search } = new URL(finding.location!.url!);
  const request = pathname + search;
  // The scanner only sees "no data", which a crash or an empty 200 also gives, so a one-GET probe must be
  // refused on purpose. data_leak paths with a dot are the exposed-file probes (/.env, /.git/HEAD).
  const reprobe = REPLAYABLE.includes(finding.kind) || (finding.kind === "data_leak" && pathname.includes("."));
  const after = reprobe ? await replay(patched + request) : undefined;
  const was = `Before: ${finding.evidence.split("\n")[0]}`;
  let check: FixCheck;
  if (still) {
    check = { name: "exploit_test", status: "fail", detail: `The same probe still works on the patched app: ${still.evidence}` };
  } else if (!after) {
    check = { name: "exploit_test", status: "pass", detail: `${was} After: the same probe against the patched app no longer exposes ${path}.` };
  } else if (deliberateRefusal(after.status, after.location)) {
    check = { name: "exploit_test", status: "pass", detail: `${was} After: the patched app refuses ${path} (${after.status}).` };
  } else {
    const answer = after.status === 0 || after.status >= 500
      ? `errored (${after.status || "no response"}) on ${path}`
      : `answered ${after.status}${after.location ? ` to ${after.location}` : ""} on ${path} instead of refusing it`;
    check = { name: "exploit_test", status: "skipped", detail: `The patched app ${answer}, so the re-test couldn't tell whether the hole is closed.` };
  }
  // Never replay an exposed file: its body is the secret.
  const original = after && REPLAYABLE.includes(finding.kind) ? await verifiedOrigin(finding) : undefined;
  if (!original || !after) return check;
  return { ...check, replay: { request: `GET ${request}`, before: await replay(original + request), after } };
}

/** 401/403/404, or a redirect to a sign-in page: the app turned the request away on purpose. */
export function deliberateRefusal(status: number, location?: string): boolean {
  if ([401, 403, 404].includes(status)) return true;
  const to = status >= 300 && status < 400 && location ? URL.parse(location, "http://x") : null;
  return !!to && /\b(log|sign)[-_]?in\b|\bauth\b/i.test(to.pathname);
}

async function replay(url: string): Promise<ReplayedResponse & { location?: string }> {
  try {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(30_000) });
    return { status: res.status, body: (await res.text()).slice(0, 400), location: res.headers.get("location") ?? undefined };
  } catch (err) {
    return { status: 0, body: (err as Error).message };
  }
}

/** Origin of the app the finding came from, only if we're allowed to probe it. */
async function verifiedOrigin(finding: Finding): Promise<string | undefined> {
  const origin = await originOf(finding);
  if (!origin) return undefined;
  const host = new URL(origin).host.toLowerCase();
  const verified = (process.env.ANTIBODY_VERIFIED_DOMAINS ?? "").split(",").map((d) => d.trim().toLowerCase());
  // Or the project's own site, once a scan saw its verify file (the scan clears this if the file goes away).
  const project = (await readDb()).projects.find((p) => p.id === finding.projectId);
  const proven = project?.verifiedDomain === true && URL.parse(project.url)?.host.toLowerCase() === host;
  return verified.includes(host) || proven ? origin : undefined;
}

/** Every other page and GET route must answer the patched app the same way it answers the original. */
async function behaviorTests(finding: Finding, fixedDir: string, patched: string): Promise<FixCheck> {
  const original = await verifiedOrigin(finding);
  if (!original) {
    return { name: "behavior_tests", status: "skipped", detail: "No verified original app to compare against." };
  }
  const fixedPath = URL.parse(finding.location?.url ?? "")?.pathname;
  const paths = routesIn(fixedDir).filter((p) => p !== fixedPath);
  const status = (origin: string, p: string) =>
    fetch(origin + p, { redirect: "manual", signal: AbortSignal.timeout(30_000) }).then((r) => r.status, () => 0);
  const results = await Promise.all(paths.map(async (p) => ({ p, before: await status(original, p), after: await status(patched, p) })));
  if (results.every((r) => r.before === 0)) {
    return { name: "behavior_tests", status: "skipped", detail: `The original app at ${original} isn't running, so there is nothing to compare against.` };
  }
  // The copy runs on placeholder keys and no database, so a route that errors only there can't be compared.
  const needsServices = results.filter((r) => r.after >= 500 && r.before > 0 && r.before < 500).map((r) => r.p);
  const compared = results.filter((r) => !needsServices.includes(r.p));
  const untested = needsServices.length ? ` Not compared, since they need the app's database or keys: ${needsServices.join(", ")}.` : "";
  if (!compared.length) return { name: "behavior_tests", status: "skipped", detail: untested.trim() };
  const changed = compared.filter((r) => r.before !== r.after);
  return changed.length
    ? { name: "behavior_tests", status: "fail", detail: `Behavior changed: ${changed.map((r) => `${r.p} ${r.before} -> ${r.after}`).join(", ")}.${untested}` }
    : { name: "behavior_tests", status: "pass", detail: `${compared.length} other pages and routes answer exactly as before (${compared.map((r) => r.p).join(", ")}).${untested}` };
}

/** Semgrep on the patched source must no longer flag the hole, and the diff must stay small. */
async function codeCheck(finding: Finding, fixedDir: string, diffLines: number, filesChanged: string[]): Promise<FixCheck> {
  const audit = await auditCode(fixedDir, finding.projectId);
  const file = finding.location?.file;
  const still = audit.findings.find((f) => f.kind === finding.kind && (!file || f.location?.file === file));
  const size = `${diffLines} lines across ${filesChanged.length} file${filesChanged.length === 1 ? "" : "s"} (limit ${MAX_DIFF_LINES})`;
  if (audit.note.startsWith("Code audit skipped")) return { name: "second_review", status: "skipped", detail: `${audit.note}. Diff: ${size}.` };
  if (still) return { name: "second_review", status: "fail", detail: `Semgrep still flags it in the patched code: ${still.evidence}. Diff: ${size}.` };
  if (diffLines > MAX_DIFF_LINES) return { name: "second_review", status: "fail", detail: `Semgrep is clean, but the diff is too large for a security fix: ${size}.` };
  return { name: "second_review", status: "pass", detail: `Semgrep no longer flags it in the patched code. Diff: ${size}.` };
}

async function originOf(finding: Finding): Promise<string | undefined> {
  return URL.parse(finding.location?.url ?? "")?.origin ?? (await readDb()).projects.find((p) => p.id === finding.projectId)?.url;
}

/** Static pages and GET route handlers under app/ (or src/app/), with [params] filled in as 1. */
function routesIn(dir: string): string[] {
  const appDir = [join(dir, "app"), join(dir, "src", "app")].find((d) => existsSync(d));
  if (!appDir) return [];
  const out = new Set<string>();
  for (const f of readdirSync(appDir, { recursive: true, encoding: "utf8" })) {
    const rel = f.replaceAll("\\", "/");
    const page = /^(.*?)\/?page\.tsx?$/.exec(rel);
    const route = /^(.*)\/route\.[jt]s$/.exec(rel);
    if (page && !page[1].includes("[")) out.add(`/${page[1]}`);
    if (route && /export\s+async\s+function\s+GET\b/.test(readFileSync(join(appDir, f), "utf8"))) {
      out.add(`/${route[1]}`.replace(/\[[^\]]+\]/g, "1"));
    }
  }
  return [...out].map((p) => p.replace(/\/+/g, "/")).sort();
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer().listen(0, "127.0.0.1", () => {
      const { port } = s.address() as AddressInfo;
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

/**
 * The patched copy is the owner's code, so it gets none of Antibody's secrets (Supabase, Photon, Factory, the
 * orchestrator token): only what node and npm need to run. No SHIELD either: test the code fix itself.
 */
function bareEnv(): NodeJS.ProcessEnv {
  const keep = ["PATH", "Path", "HOME", "USERPROFILE", "TMPDIR", "TEMP", "TMP", "SystemRoot", "ComSpec", "APPDATA", "LOCALAPPDATA"];
  const env: NodeJS.ProcessEnv = { NEXT_TELEMETRY_DISABLED: "1", NODE_ENV: "development" };
  for (const k of keep) if (process.env[k]) env[k] = process.env[k];
  return env;
}

/** The folder holding next.config.* that contains the most changed files; else the shallowest; else the root. */
function locateApp(root: string, filesChanged: string[]): string {
  const configs = readdirSync(root, { recursive: true, encoding: "utf8" })
    .map((f) => f.replaceAll("\\", "/"))
    .filter((f) => /(^|\/)next\.config\.(js|mjs|cjs|ts|mts)$/.test(f) && !/(^|\/)(node_modules|\.next)\//.test(f))
    .map((f) => (f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : ""));
  if (!configs.length) return root;
  const owns = (dir: string) => filesChanged.filter((f) => !dir || f.replaceAll("\\", "/").startsWith(`${dir}/`)).length;
  const best = [...configs].sort((a, b) => owns(b) - owns(a) || a.split("/").length - b.split("/").length)[0];
  return join(root, best);
}

/**
 * Stand-ins for the variables the repo's .env.example lists, so an app that throws on a missing DATABASE_URL or
 * API key still boots. Connection strings point at a closed local port: a query fails fast, nothing leaves the box.
 */
export function placeholderEnv(...dirs: string[]): NodeJS.ProcessEnv {
  const example = dirs.flatMap((d) => [".env.example", ".env.sample", ".env.template"].map((n) => join(d, n))).find((p) => existsSync(p));
  if (!example) return {};
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value = ""] of Object.entries(parseEnv(readFileSync(example, "utf8")))) {
    const scheme = /^([a-z][\w+.-]*):\/\//i.exec(value)?.[1];
    if (scheme && !/^https?$/i.test(scheme)) env[key] = `${scheme}://antibody:antibody@127.0.0.1:1/antibody`;
    else if (!value || value.includes("<")) env[key] = "antibody-placeholder-0000000000000000";
    else env[key] = value;
  }
  return env;
}

/**
 * A fresh clone has no node_modules. Install with the lockfile and no dependency install scripts, then run only the
 * repo's own postinstall (e.g. `prisma generate`): next dev runs the repo's code anyway, with the same bare env.
 */
async function installDeps(root: string, appDir: string): Promise<void> {
  if (existsSync(join(root, "node_modules")) || !existsSync(join(root, "package.json"))) return;
  const npm = (args: string[], cwd = root) =>
    new Promise<void>((resolve, reject) => {
      const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", [...args, "--no-audit", "--no-fund", "--loglevel=error"], {
        cwd,
        env: { ...placeholderEnv(appDir, root), ...bareEnv() },
        shell: process.platform === "win32",
        stdio: ["ignore", "ignore", "pipe"],
      });
      let err = "";
      child.stderr?.on("data", (d) => (err = (err + d).slice(-400)));
      const timer = setTimeout(() => child.kill(), INSTALL_TIMEOUT_MS);
      child.on("exit", (code) => (clearTimeout(timer), code === 0 ? resolve() : reject(new Error(`npm ${args[0]} failed: ${err.trim().split("\n").at(-1) ?? code}`))));
    });
  // A lockfile out of step with package.json makes `npm ci` refuse; plain install still works.
  if (existsSync(join(root, "package-lock.json"))) await npm(["ci", "--ignore-scripts"]).catch(() => npm(["install", "--ignore-scripts"]));
  else await npm(["install", "--ignore-scripts"]);
  // A failed codegen step shows up as a start failure below, with the app's own error.
  for (const dir of new Set([root, appDir])) await npm(["run", "postinstall", "--if-present"], dir).catch(() => {});
}

/** The repo's own Next if it has one (nearest node_modules from the app folder up to the copy's root), else ours. */
function nextBin(appDir: string, root: string): string {
  for (let dir = appDir; ; dir = dirname(dir)) {
    const bin = join(dir, "node_modules/next/dist/bin/next");
    if (existsSync(bin)) return bin;
    if (!relative(root, dir) || dir === dirname(dir)) break;
  }
  return join(repoRoot(), "node_modules/next/dist/bin/next");
}

/** `next dev` on the patched copy, on a free localhost port. Resolves once it serves "/". */
async function startApp(dir: string, root: string): Promise<App> {
  const port = await freePort();
  const child = spawn(process.execPath, [nextBin(dir, root), "dev", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: dir,
    env: { ...placeholderEnv(dir, root), ...bareEnv() },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  // The last lines of output, so a failed start says why instead of just an exit code.
  let output = "";
  const keepTail = (d: Buffer) => (output = (output + d).slice(-600));
  child.stdout?.on("data", keepTail);
  child.stderr?.on("data", keepTail);
  // Resolves once the whole process tree is gone, so the caller can delete the folder it was using.
  const stop = () =>
    new Promise<void>((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once("exit", () => resolve());
      if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      else if (child.pid) process.kill(-child.pid, "SIGKILL");
    });
  const origin = `http://127.0.0.1:${port}`;
  for (const deadline = Date.now() + START_TIMEOUT_MS; Date.now() < deadline; ) {
    if (child.exitCode !== null) {
      const why = output.trim().split("\n").filter(Boolean).slice(-2).join(" ").slice(0, 300);
      throw new Error(`next dev exited with code ${child.exitCode}${why ? `: ${why}` : ""}`);
    }
    // manual: a signed-out redirect (to /login) means the server is up, whatever the login page needs.
    if (await fetch(`${origin}/`, { redirect: "manual", signal: AbortSignal.timeout(30_000) }).then((r) => r.status < 500, () => false)) {
      return { origin, stop };
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  await stop();
  const why = output.match(/(?:Error|⨯)[^\n]*/g)?.at(-1)?.slice(0, 300);
  throw new Error(`no response on ${origin} within ${START_TIMEOUT_MS / 1000}s${why ? `: ${why}` : ""}`);
}
