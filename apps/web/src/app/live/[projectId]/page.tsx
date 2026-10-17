import { Suspense } from "react";
import { connection } from "next/server";
import { readDb, startCodeFor } from "@antibody/core";
import { currentUser, owns } from "@/lib/auth";
import { LiveView } from "./LiveView";

export const metadata = { title: "Live | Antibody" };

export default function LivePage({ params }: { params: Promise<{ projectId: string }> }) {
  return (
    <Suspense fallback={<div className="ab"><p className="wrap page sub">Connecting…</p></div>}>
      <LiveWithCode params={params} />
    </Suspense>
  );
}

/** The START code is the proof a phone belongs to this project's owner, so only the signed-in owner sees it. */
async function LiveWithCode({ params }: { params: Promise<{ projectId: string }> }) {
  await connection();
  const { projectId } = await params;
  const [user, db] = await Promise.all([currentUser(), readDb()]);
  const mine = owns(user, db.projects.find((p) => p.id === projectId));
  return <LiveView startCode={mine ? await startCodeFor(projectId) : undefined} />;
}
