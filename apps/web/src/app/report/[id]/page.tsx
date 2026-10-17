import { Suspense } from "react";
import { ReportView } from "./ReportView";

export const metadata = { title: "Security report | Antibody" };

export default function ReportPage() {
  return (
    <Suspense fallback={<p className="mx-auto max-w-5xl px-5 py-16 text-slate-400">Loading report…</p>}>
      <ReportView />
    </Suspense>
  );
}
