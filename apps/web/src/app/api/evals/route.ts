import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { connection } from "next/server";
import { repoRoot, type EvalSnapshot } from "@antibody/core";

/** Latest scoreboard written by `npm run eval`. Missing file is an empty board, not an error. */
export async function GET() {
  await connection();
  const path = join(repoRoot(), "evals", "results.json");
  if (!existsSync(path)) return Response.json({ empty: true });
  try {
    return Response.json(JSON.parse(readFileSync(path, "utf8")) as EvalSnapshot);
  } catch {
    return Response.json({ error: "Eval results could not be read" }, { status: 500 });
  }
}
