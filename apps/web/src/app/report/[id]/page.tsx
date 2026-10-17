import { Suspense } from "react";
import { ReportView } from "./ReportView";

export const metadata = { title: "Security report | Antibody" };

export default function ReportPage() {
  return (
    <Suspense fallback={<div className="ab"><p className="wrap page sub">Loading report…</p></div>}>
      <ReportView />
    </Suspense>
  );
}
