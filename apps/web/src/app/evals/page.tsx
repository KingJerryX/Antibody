import { Suspense } from "react";
import { EvalView } from "./EvalView";

export const metadata = { title: "Eval | Antibody" };

export default function EvalsPage() {
  return (
    <Suspense fallback={<div className="ab"><p className="wrap page sub">Loading the scoreboard…</p></div>}>
      {/* The eval attacks a local port, so only a local web app can run it. */}
      <EvalView canRun={!process.env.VERCEL} />
    </Suspense>
  );
}
