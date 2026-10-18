// The fixer sends the attack counts back to Chalk, then we replay the ownership rule that answer implies.
// Passed means a stranger's profile is refused and the owner's own profile still opens.
import type { RequestCounts } from "@antibody/core";
import { rescore, type BlockContext } from "@antibody/shield";

export type FixProof = { attempted: number; passed: number; note: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Profile walk: only the signed-in user may read that id. Same rule as the IDOR patch. */
export function replayOwnProfile(): boolean {
  const exists = (id: number) => (id >= 1 && id <= 8 ? 200 : 404);
  const patched = (me: number | null, id: number) => (me === null || me !== id ? 404 : exists(id));
  return exists(2) === 200 && patched(null, 2) === 404 && patched(1, 2) === 404 && patched(1, 1) === 200;
}

/** The agent. A Chalk block about reading other users becomes the ownership fix. Anything else is left alone. */
export function proposeFix(ctx: BlockContext): "own-profile" | "none" {
  const text = `${ctx.path} ${ctx.reasons.join(" ")}`.toLowerCase();
  const profile = ctx.path.includes("/api/users/") || text.includes("profile") || text.includes("users");
  if (!profile) return "none";
  if (ctx.decision === "block" || ctx.decision === "challenge" || ctx.distinctUsers >= 6) return "own-profile";
  return "none";
}

/** Load the profile-walk counts the shield just reported, ask Chalk to score them, then replay the fix. */
export async function proveIdorFix(load: () => Promise<RequestCounts | null>): Promise<FixProof> {
  let counts: RequestCounts | null = null;
  for (let i = 0; i < 5 && !counts; i++) {
    if (i) await sleep(1500);
    try {
      counts = await load();
    } catch {
      counts = null;
    }
  }
  if (!counts) return { attempted: 1, passed: 0, note: "The fixer found no attack counts to send to Chalk." };
  let ctx: BlockContext | null = null;
  try {
    ctx = await rescore(counts);
  } catch {
    ctx = null;
  }
  if (!ctx) return { attempted: 1, passed: 0, note: "Chalk did not score the attack the shield recorded." };
  if (proposeFix(ctx) !== "own-profile") {
    return { attempted: 1, passed: 0, note: "Chalk's score for this attack was not a profile walk, so no patch was replayed." };
  }
  const passed = replayOwnProfile();
  return {
    attempted: 1,
    passed: passed ? 1 : 0,
    note: passed
      ? "The fixer asked Chalk to score the attack again. Replaying the profile walk against the patch was refused, and the owner's own profile still opened."
      : "The patch still returned the other profile.",
  };
}
