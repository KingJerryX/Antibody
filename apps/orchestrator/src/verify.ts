// Antibody's own checks on a Droid fix: start the patched copy and re-attack it, compare its behavior
// with the original app, and re-run Semgrep on the patched code. Droid's self-reported tests don't count.
import { spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { createServer, type AddressInfo } from "node:net";
import { join } from "node:path";
import { readDb, repoRoot, type Finding, type FindingKind, type FixCheck, type ReplayedResponse } from "@antibody/core";
import { auditCode, scanUrl } from "@antibody/scanner";

const START_TIMEOUT_MS = 120_000;
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
): Promise<FixCheck[]> {
  const settle = (check: FixCheck) => (onCheck(check), check);
  const preview = settle({ name: "preview_replay", status: "skipped", detail: "No preview deployments in local mode." });
  const code = settle(await codeCheck(finding, fixedDir, diffLines, filesChanged));
  let app: App;
  try {
    app = await startApp(fixedDir);
  } catch (err) {
    const detail = `The patched app didn't start: ${(err as Error).message}`;
    const exploit = settle({ name: "exploit_test", status: "fail", detail });
    const behavior = settle({ name: "behavior_tests", status: "fail", detail });
    return [exploit, behavior, preview, code];
  }
  try {
    const exploit = settle(await exploitTest(finding, app.origin));
    const behavior = settle(await behaviorTests(finding, fixedDir, app.origin));
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
  const check: FixCheck = still
    ? { name: "exploit_test", status: "fail", detail: `The same probe still works on the patched app: ${still.evidence}` }
    : { name: "exploit_test", status: "pass", detail: `Before: ${finding.evidence.split("\n")[0]} After: the same probe against the patched app no longer exposes ${path}.` };
  const original = await verifiedOrigin(finding);
  if (!original || !REPLAYABLE.includes(finding.kind)) return check;
  const { pathname, search } = new URL(finding.location!.url!);
  const [before, after] = await Promise.all([replay(original + pathname + search), replay(patched + pathname + search)]);
  return { ...check, replay: { request: `GET ${pathname}${search}`, before, after } };
}

async function replay(url: string): Promise<ReplayedResponse> {
  try {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(30_000) });
    return { status: res.status, body: (await res.text()).slice(0, 400) };
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
  const changed = results.filter((r) => r.before !== r.after);
  return changed.length
    ? { name: "behavior_tests", status: "fail", detail: `Behavior changed: ${changed.map((r) => `${r.p} ${r.before} -> ${r.after}`).join(", ")}` }
    : { name: "behavior_tests", status: "pass", detail: `${results.length} other pages and routes answer exactly as before (${paths.join(", ")}).` };
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

/** Static pages and GET route handlers under app/, with [params] filled in as 1. */
function routesIn(dir: string): string[] {
  const appDir = join(dir, "app");
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

/** `next dev` on the patched copy, on a free localhost port. Resolves once it serves "/". */
async function startApp(dir: string): Promise<App> {
  const port = await freePort();
  const env = { ...process.env };
  delete env.SHIELD; // test the code fix itself, not the shield in front of it
  const child = spawn(process.execPath, [join(repoRoot(), "node_modules/next/dist/bin/next"), "dev", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: dir,
    env,
    stdio: "ignore",
    detached: process.platform !== "win32",
  });
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
    if (child.exitCode !== null) throw new Error(`next dev exited with code ${child.exitCode}`);
    if (await fetch(`${origin}/`, { signal: AbortSignal.timeout(30_000) }).then((r) => r.status < 500, () => false)) return { origin, stop };
    await new Promise((r) => setTimeout(r, 1000));
  }
  await stop();
  throw new Error(`no response on ${origin} within ${START_TIMEOUT_MS / 1000}s`);
}
