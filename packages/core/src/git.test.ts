import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { cloneRepo, git, pushFixBranch, snapshot, workingDiff } from "./git.ts";

// A local bare repo stands in for GitHub: same clone / push path, no network or token.
const root = mkdtempSync(join(tmpdir(), "antibody-git-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const sh = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" });

function makeOrigin(): string {
  const origin = join(root, "origin.git");
  const seed = join(root, "seed");
  sh(root, "init", "--quiet", "--bare", "-b", "main", origin);
  mkdirSync(join(seed, "app/api/users"), { recursive: true });
  writeFileSync(join(seed, "app/api/users/route.ts"), "export const GET = () => Response.json(ALL_USERS);\n");
  sh(seed, "init", "--quiet", "-b", "main");
  sh(seed, "add", "-A");
  sh(seed, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "seed");
  sh(seed, "push", "--quiet", origin, "main");
  return origin;
}

describe("fix pipeline git helpers", () => {
  it("diffs an edited clone exactly and pushes it as a fix branch", async () => {
    const origin = makeOrigin();

    // Stage 2: Droid edits a fresh clone; git reports exactly what changed, new files included.
    const work = join(root, "work");
    await cloneRepo(origin, work);
    writeFileSync(join(work, "app/api/users/route.ts"), "export const GET = () => new Response(null, { status: 401 });\n");
    writeFileSync(join(work, "app/session.ts"), "export const session = 1;\n");
    const { diff, files } = await workingDiff(work);
    expect(files.sort()).toEqual(["app/api/users/route.ts", "app/session.ts"]);
    expect(diff).toContain("+export const GET = () => new Response(null, { status: 401 });");

    // Stage 3: a second fresh clone gets the same diff on a new branch, committed as the bot, pushed.
    const pr = join(root, "pr");
    await cloneRepo(origin, pr);
    await pushFixBranch(pr, {
      branch: "antibody/fix_123",
      diff,
      message: "Antibody: Users can read each other's data",
      author: { name: "antibody-test[bot]", email: "1+antibody-test[bot]@users.noreply.github.com" },
    });
    expect(sh(origin, "log", "antibody/fix_123", "-1", "--format=%an|%s").trim()).toBe("antibody-test[bot]|Antibody: Users can read each other's data");
    expect(sh(origin, "show", "antibody/fix_123:app/session.ts")).toBe("export const session = 1;\n");
    // main is untouched: Antibody only ever proposes.
    expect(sh(origin, "show", "main:app/api/users/route.ts")).toContain("ALL_USERS");
  });

  it("snapshots a plain folder so edits to it can be diffed", async () => {
    const dir = join(root, "plain");
    mkdirSync(dir);
    writeFileSync(join(dir, "a.ts"), "1\n");
    await snapshot(dir);
    writeFileSync(join(dir, "a.ts"), "2\n");
    const { files } = await workingDiff(dir);
    expect(files).toEqual(["a.ts"]);
    expect((await git(dir, ["log", "--format=%s"])).trim()).toBe("base");
    expect(readFileSync(join(dir, "a.ts"), "utf8")).toBe("2\n");
  });
});
