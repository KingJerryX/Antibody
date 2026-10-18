import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { connection } from "next/server";
import { hasRemoteStore, readNamedRow, repoRoot, writeNamedRow, type EvalSnapshot } from "@antibody/core";
import { runEval } from "../../../../../../evals/run.ts";
import published from "../../../../../../evals/results.json";

export const maxDuration = 300;

const isSnapshot = (v: unknown): v is EvalSnapshot => Boolean(v && typeof v === "object" && "shield" in v);

/** Latest scoreboard: the run `npm run eval` published to the shared store, else its local file, else the run that shipped. */
export async function GET() {
  await connection();
  if (hasRemoteStore()) {
    try {
      const stored = await readNamedRow<EvalSnapshot>("eval-snapshot");
      if (isSnapshot(stored)) return Response.json(stored);
    } catch (err) {
      console.error("[evals]", err instanceof Error ? err.message : "could not read the stored run");
    }
  }
  const path = join(repoRoot(), "evals", "results.json");
  if (existsSync(path)) {
    try {
      return Response.json(JSON.parse(readFileSync(path, "utf8")) as EvalSnapshot);
    } catch {
      return Response.json({ error: "Eval results could not be read" }, { status: 500 });
    }
  }
  if (published && typeof published === "object" && "shield" in published) return Response.json(published);
  return Response.json({ empty: true });
}

/** Run the scoreboard against the local shielded sample. Same work as `npm run eval`, so it only works locally. */
export async function POST() {
  await connection();
  if (process.env.VERCEL) {
    return Response.json({ error: "The eval attacks the local sample app. Run `npm run eval` on your machine; this page shows the latest run." }, { status: 400 });
  }
  try {
    const snap = await runEval();
    if (hasRemoteStore()) await writeNamedRow("eval-snapshot", snap);
    else writeFileSync(join(repoRoot(), "evals", "results.json"), JSON.stringify(snap, null, 2));
    return Response.json(snap);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Eval failed";
    console.error("[evals]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
