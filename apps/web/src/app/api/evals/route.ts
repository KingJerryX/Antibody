import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { connection } from "next/server";
import { repoRoot, type EvalSnapshot } from "@antibody/core";
import published from "../../../../../../evals/results.json";

/** Latest scoreboard written by `npm run eval`. Missing file is an empty board, not an error.
 *  The deployed function cannot see the repo file, so the import is the run that shipped. */
export async function GET() {
  await connection();
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
