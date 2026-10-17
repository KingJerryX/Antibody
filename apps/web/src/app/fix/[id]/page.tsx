import { Suspense } from "react";
import { FixView } from "./FixView";

export const metadata = { title: "Review fix | Antibody" };

export default function FixPage() {
  return (
    <Suspense fallback={<p className="mx-auto max-w-6xl px-5 py-16 text-slate-400">Loading fix…</p>}>
      <FixView />
    </Suspense>
  );
}
