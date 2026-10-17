import { Suspense } from "react";
import { connection } from "next/server";
import { startCodeFor } from "@antibody/core";
import { LiveView } from "./LiveView";

export const metadata = { title: "Live | Antibody" };

export default function LivePage({ params }: { params: Promise<{ projectId: string }> }) {
  return (
    <Suspense fallback={<div className="ab"><p className="wrap page sub">Connecting…</p></div>}>
      <LiveWithCode params={params} />
    </Suspense>
  );
}

/** The START code is the proof a phone belongs to this project's owner, so it's rendered only here (localhost). */
async function LiveWithCode({ params }: { params: Promise<{ projectId: string }> }) {
  await connection();
  const { projectId } = await params;
  return <LiveView startCode={await startCodeFor(projectId)} />;
}
