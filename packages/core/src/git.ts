// Thin wrappers over the git CLI for the fix pipeline. Remote-agnostic, so tests can use a local bare repo.
import { execFile } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const TIMEOUT_MS = 120_000;

/** `-c http.extraHeader=…` keeps a token out of argv-visible URLs and out of the clone's .git/config. */
const authArgs = (authHeader?: string) => (authHeader ? ["-c", `http.extraHeader=${authHeader}`] : []);

export async function git(cwd: string, args: string[], authHeader?: string): Promise<string> {
  const { stdout } = await run("git", [...authArgs(authHeader), ...args], { cwd, timeout: TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 });
  return stdout;
}

/** Shallow clone of the default branch into `dest` (which must not exist yet). */
export async function cloneRepo(remote: string, dest: string, authHeader?: string): Promise<void> {
  await run("git", [...authArgs(authHeader), "clone", "--depth", "1", "--quiet", remote, dest], { timeout: TIMEOUT_MS });
}

/** Makes a plain folder a git repo with one commit, so later edits can be diffed exactly. */
export async function snapshot(dir: string): Promise<void> {
  await git(dir, ["init", "--quiet"]);
  await git(dir, ["add", "-A"]);
  await git(dir, [...identity("antibody", "antibody@localhost"), "commit", "--quiet", "--allow-empty", "-m", "base"]);
}

/** Every change since the last commit, new files included. */
export async function workingDiff(dir: string): Promise<{ diff: string; files: string[] }> {
  await git(dir, ["add", "-A"]);
  const diff = await git(dir, ["diff", "--cached", "--binary"]);
  const files = (await git(dir, ["diff", "--cached", "--name-only"])).split("\n").filter(Boolean);
  return { diff, files };
}

const identity = (name: string, email: string) => ["-c", `user.name=${name}`, "-c", `user.email=${email}`];

/** Applies `diff` on a new branch in a clone, commits as `author`, and pushes the branch to `origin`. */
export async function pushFixBranch(
  dir: string,
  opts: { branch: string; diff: string; message: string; author: { name: string; email: string }; authHeader?: string },
): Promise<void> {
  const patch = join(dir, ".git", "antibody-fix.patch");
  writeFileSync(patch, opts.diff.endsWith("\n") ? opts.diff : `${opts.diff}\n`);
  await git(dir, ["checkout", "--quiet", "-b", opts.branch]);
  await git(dir, ["apply", "--whitespace=nowarn", patch]);
  await git(dir, ["add", "-A"]);
  await git(dir, [...identity(opts.author.name, opts.author.email), "commit", "--quiet", "-m", opts.message]);
  await git(dir, ["push", "--quiet", "origin", opts.branch], opts.authHeader);
}
