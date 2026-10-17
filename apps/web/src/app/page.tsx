import Link from "next/link";
import { Suspense } from "react";
import { ScanForm } from "@/components/ScanForm";
import { Card, Icon, type IconName } from "@/components/ui";
import { readStore } from "@/lib/server";

const STEPS: { icon: IconName; title: string; body: string }[] = [
  { icon: "search", title: "Scan", body: "Paste a URL. We look for the holes AI coding tools leave: open databases, keys in the browser, unprotected admin pages." },
  { icon: "wrench", title: "Fix", body: "Factory Droid proves the attack is real, writes the fix, and tests it before you ever see it." },
  { icon: "shield", title: "Shield", body: "A live shield powered by Chalk blocks attacks inside the request, including ones no scanner predicted." },
  { icon: "message", title: "It texts you", body: "Plain English over iMessage. In an emergency, it calls. Otherwise it stays quiet." },
];

const STACK = [
  { name: "Photon", role: "iMessage and voice" },
  { name: "Chalk", role: "Live features and evals" },
  { name: "Factory Droid", role: "Finds holes, writes fixes" },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-5">
      <section className="pt-20 pb-16 sm:pt-28" aria-labelledby="hero">
        <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-mint/30 bg-mint/10 px-3 py-1 text-xs font-medium uppercase tracking-widest text-mint">
          <Icon name="shield" className="h-3.5 w-3.5" /> Security teammate for vibe-coded apps
        </p>
        <h1 id="hero" className="max-w-4xl text-5xl font-semibold leading-[1.02] tracking-tight text-white sm:text-7xl">
          Your app was vibe-coded.
          <span className="block text-mint">Its security shouldn&apos;t be.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-slate-300 sm:text-xl">
          Antibody finds the holes AI tools leave behind, writes tested fixes you approve, blocks live attacks, and tells you about it over iMessage.
        </p>
        <div id="scan" className="mt-10 max-w-3xl scroll-mt-24">
          <ScanForm />
        </div>
      </section>

      <section aria-labelledby="how" className="pb-16">
        <h2 id="how" className="mb-6 text-sm font-semibold uppercase tracking-widest text-slate-400">How it works</h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <Card className="h-full p-5">
                <div className="mb-4 flex items-center justify-between">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-mint/10 text-mint">
                    <Icon name={s.icon} className="h-5 w-5" />
                  </span>
                  <span className="font-mono text-xs text-slate-500">0{i + 1}</span>
                </div>
                <h3 className="text-lg font-semibold text-white">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.body}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="stack" className="pb-16">
        <h2 id="stack" className="sr-only">Built on</h2>
        <div className="flex flex-col items-start gap-4 rounded-2xl border border-line bg-panel/60 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-slate-400">Built on</span>
          <ul className="flex flex-wrap gap-x-10 gap-y-3">
            {STACK.map((s) => (
              <li key={s.name}>
                <span className="text-lg font-semibold text-white">{s.name}</span>
                <span className="ml-2 text-sm text-slate-400">{s.role}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="recent" className="pb-24">
        <div className="mb-6 flex items-end justify-between">
          <h2 id="recent" className="text-sm font-semibold uppercase tracking-widest text-slate-400">Your projects</h2>
          <Link href="/evals" className="text-sm text-mint hover:underline">See the eval scoreboard</Link>
        </div>
        <Suspense fallback={<p className="text-sm text-slate-500">Loading projects…</p>}>
          <RecentProjects />
        </Suspense>
      </section>
    </div>
  );
}

async function RecentProjects() {
  const db = await readStore();
  const projects = [...db.projects].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
  if (!projects.length) return <p className="text-sm text-slate-500">No projects yet. Scan a URL above to create one.</p>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((p) => {
        const last = db.scans.findLast((s) => s.projectId === p.id); // scans are appended in start order
        return (
          <li key={p.id}>
            <Card className="p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-sm text-white">{p.name}</span>
                {p.verifiedDomain && <span className="rounded-full bg-mint/10 px-2 py-0.5 text-xs text-mint">verified</span>}
              </div>
              <div className="mt-3 flex gap-4 text-sm">
                <Link href={`/live/${p.id}`} className="text-mint hover:underline">Live view</Link>
                {last && <Link href={`/report/${last.id}`} className="text-slate-300 hover:underline">Latest report</Link>}
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
