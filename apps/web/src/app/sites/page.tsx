import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Card } from "@/components/ui";
import { readStore } from "@/lib/server";
import { currentUser } from "@/lib/auth";
import { ScanSiteButton } from "@/components/ScanSiteButton";

type Search = Promise<{ vercel?: string; vercelError?: string }>;

export const metadata = { title: "Your sites | Antibody" };

export default function SitesPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<p className="mx-auto max-w-3xl px-5 py-16 text-slate-400">Loading your sites…</p>}>
      <Sites searchParams={searchParams} />
    </Suspense>
  );
}

/** Everything a signed-in owner has set up, so progress (repo, proof, last scan) is never lost between visits. */
async function Sites({ searchParams }: { searchParams: Search }) {
  await connection();
  const user = await currentUser();
  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-white">Your sites</h1>
        <p className="mt-3 text-slate-400">Sign in with GitHub to see the sites you&apos;ve scanned and set up.</p>
        <a href="/api/auth/github?next=/sites" className="mt-6 inline-flex rounded-lg bg-mint px-4 py-2 text-sm font-semibold text-ink hover:brightness-110">
          Sign in with GitHub
        </a>
      </div>
    );
  }
  const db = await readStore();
  const sites = db.projects.filter((p) => p.ownerId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="text-3xl font-semibold tracking-tight text-white">Your sites</h1>
      <p className="mt-2 text-slate-400">Signed in as {user.login}. Scans you run while signed in are saved here.</p>
      <VercelBanner {...await searchParams} />
      <a href="/api/vercel/connect" className="mt-5 inline-flex rounded-lg bg-mint px-4 py-2 text-sm font-semibold text-ink hover:brightness-110">
        Connect Vercel
      </a>
      <p className="mt-2 text-xs text-slate-500">Imports every site on your Vercel projects. Vercel has already checked you own those domains, so they get the full scan with no verification step.</p>
      {!sites.length && (
        <p className="mt-8 text-slate-400">
          Nothing yet. <Link href="/#scan" className="text-mint hover:underline">Scan a site</Link> to start.
        </p>
      )}
      <ul className="mt-8 space-y-4">
        {sites.map((p) => {
          const scan = db.scans.filter((s) => s.projectId === p.id).at(-1);
          const ran = scan?.checks?.filter((c) => c.status !== "not_run").length;
          const steps = [
            p.repo ? `GitHub: ${p.repo}` : "GitHub not connected",
            p.verifiedDomain ? "Proven yours through Vercel" : "Not proven yet: connect Vercel",
            scan ? `Last scan: ${scan.checks ? `${ran}/${scan.checks.length} checks run, ` : ""}${scan.findings.length} finding${scan.findings.length === 1 ? "" : "s"}` : "Not scanned yet",
          ];
          return (
            <li key={p.id}>
              <Card className="p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 className="font-mono text-lg text-white">{p.name}</h2>
                  <span className="flex gap-4 text-sm">
                    {!p.url.startsWith("https://github.com/") && <ScanSiteButton url={p.url} />}
                    {scan && (
                      <Link href={`/report/${scan.id}`} className="text-mint hover:underline">
                        Report
                      </Link>
                    )}
                    <Link href={`/connect/${p.id}`} className="text-mint hover:underline">
                      Setup
                    </Link>
                  </span>
                </div>
                <ul className="mt-3 space-y-1 text-sm text-slate-400">
                  {steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function VercelBanner({ vercel, vercelError }: { vercel?: string; vercelError?: string }) {
  const msg = vercelError
    ? `Vercel didn't connect: ${vercelError.slice(0, 200)}`
    : vercel === "mock"
      ? "Connect Vercel is in mock mode here (no ANTIBODY_VERCEL_* keys), so nothing was imported."
      : vercel === "off"
        ? "Connect Vercel isn't set up on this site yet."
        : vercel && /^\d+$/.test(vercel)
          ? `Imported ${vercel} site${vercel === "1" ? "" : "s"} from Vercel. They're proven yours, so scans run every check.`
          : undefined;
  return msg ? <p role="status" className={`mt-4 text-sm ${vercelError ? "text-red-300" : "text-slate-300"}`}>{msg}</p> : null;
}
