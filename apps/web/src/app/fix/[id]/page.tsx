import { Suspense } from "react";
import { FixView } from "./FixView";

export const metadata = { title: "Review fix | Antibody" };

export default function FixPage() {
  return (
    <Suspense fallback={<div className="ab"><p className="wrap page sub">Loading fix…</p></div>}>
      <FixView />
    </Suspense>
  );
}
