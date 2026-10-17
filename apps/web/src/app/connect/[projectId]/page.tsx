import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { installationRepos, readGithubApp, startCodeFor } from "@antibody/core";
import { Card, Icon } from "@/components/ui";
import { readStore } from "@/lib/server";
import { CopyButton, RefreshWhile } from "./ConnectClient";

export const metadata = { title: "Set up | Antibody" };

type Search = Promise<{ phoneError?: string }>;

export default function ConnectPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Search }) {
  return (
    <Suspense fallback={<p className="mx-auto max-w-3xl px-5 py-16 text-slate-400">Loading setup…</p>}>
      <Setup params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/** "+16283166196" -> "+1 (628) 316-6196"; anything else is shown as-is. */
const prettyPhone = (n: string) => n.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "+1 ($1) $2-$3");

async function Setup({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Search }) {
  await connection();
  const { projectId } = await params;
  const db = await readStore();
  const project = db.projects.find((p) => p.id === projectId);
  if (!project) notFound();

  // The START code proves a phone belongs to someone who can see this page (localhost only).
  const code = await startCodeFor(projectId);
  const memory = db.memory.find((m) => m.projectId === projectId);
  const linked = memory?.teammates ?? [];
  // Phones registered with Photon from this page, each with the Antibody line Photon assigned it.
  const registered = memory?.phoneLines ?? [];
  const phoneError = (await searchParams).phoneError?.slice(0, 300);
  const steps = [project.verifiedDomain, Boolean(project.repo), linked.length > 0];

  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      {/* Poll until a phone is linked, so the step turns green on its own. */}
      <RefreshWhile active={!linked.length} />
      <div className="mb-2 flex flex-wrap items-center gap-3 text-sm text-slate-400">
        <span>Set up</span>
        <span aria-hidden="true">/</span>
        <span className="font-mono text-slate-300">{project.name}</span>
        <Link href={`/live/${projectId}`} className="ml-auto inline-flex items-center gap-1 text-mint hover:underline">
          Live view <Icon name="arrow" className="h-3.5 w-3.5" />
        </Link>
      </div>
      <h1 className="text-3xl font-semibold tracking-tight text-white">Set up alerts and fixes</h1>
      <p className="mt-2 text-slate-400">{steps.filter(Boolean).length} of 3 done</p>

      <ol className="mt-8 space-y-4">
        <Step done={project.verifiedDomain} title="Verify your site">
          {project.verifiedDomain ? (
            <p>Done. Antibody can test {project.name} to prove what it finds.</p>
          ) : (
            <p>
              Antibody only probes sites you’ve proved you own. Add <code className="font-mono text-slate-200">{project.name}</code> to{" "}
              <code className="font-mono text-slate-200">ANTIBODY_VERIFIED_DOMAINS</code>. Domain verification (a DNS record) replaces this in production.
            </p>
          )}
        </Step>

        <Step done={Boolean(project.repo)} title="Connect GitHub">
          <GithubStep projectId={projectId} repo={project.repo} installationId={project.githubInstallationId} />
        </Step>

        <Step done={linked.length > 0} title="Get alerts on your phone">
          {linked.length > 0 ? (
            <p>
              Linked to <span className="font-mono text-slate-200">{linked.map((t) => `••${t.handle.slice(-4)}`).join(", ")}</span>. Antibody texts this
              number when something’s wrong and calls it when it’s urgent. Text <span className="font-mono text-slate-200">STATUS</span> anytime.
            </p>
          ) : (
            <>
              {registered.map((r) => (
                <div key={r.handle} className="mb-5">
                  <p>
                    From your phone <span className="font-mono text-slate-200">••{r.handle.slice(-4)}</span>, send this as an iMessage (blue bubble):
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span className="rounded-lg border border-line bg-black/30 px-3 py-1.5 font-mono text-base text-white">START {code}</span>
                    <span className="text-slate-400">to</span>
                    <span className="font-mono text-base text-white">{prettyPhone(r.line)}</span>
                    <CopyButton text={`START ${code}`} />
                  </div>
                  <a
                    href={`sms:${r.line}?&body=${encodeURIComponent(`START ${code}`)}`}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-mint px-4 py-2 text-sm font-semibold text-ink hover:brightness-110"
                  >
                    <Icon name="message" className="h-4 w-4" /> Text it now
                  </a>
                  <p className="mt-2 text-xs text-slate-500">Antibody replies to confirm. Waiting for your text…</p>
                </div>
              ))}
              <p>
                {registered.length
                  ? "Using a different phone? Add it here."
                  : "Enter your phone number. Antibody registers it and gives you the number to text. Then it texts you when something’s wrong and calls if it’s urgent."}
              </p>
              <form action="/api/photon/register" method="post" className="mt-3 flex flex-wrap items-center gap-3">
                <input type="hidden" name="projectId" value={projectId} />
                <label className="sr-only" htmlFor="phone">
                  Your phone number
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  required
                  placeholder="+1 617 555 0123"
                  className="w-56 rounded-lg border border-line bg-black/30 px-3 py-2 font-mono text-white placeholder:text-slate-600"
                />
                <button className="rounded-lg bg-mint px-4 py-2 text-sm font-semibold text-ink hover:brightness-110">
                  {registered.length ? "Add phone" : "Get my number"}
                </button>
              </form>
              {phoneError && (
                <p role="alert" className="mt-2 text-sm text-red-300">
                  {phoneError}
                </p>
              )}
            </>
          )}
        </Step>
      </ol>
    </div>
  );
}

async function GithubStep({ projectId, repo, installationId }: { projectId: string; repo?: string; installationId?: number }) {
  if (repo) {
    return (
      <p>
        Connected to{" "}
        <a href={`https://github.com/${repo}`} className="font-mono text-slate-200 hover:underline">
          {repo}
        </a>
        . Antibody audits this repo’s code and opens its fixes here as pull requests.{" "}
        <a href={`/api/github/new?project=${encodeURIComponent(projectId)}`} className="text-mint hover:underline">
          Change repos
        </a>
      </p>
    );
  }
  if (installationId) {
    // Installed on several repos: ask which one this project is.
    const repos = await installationRepos(installationId).catch(() => []);
    return (
      <>
        <p>GitHub is connected. Which repo is this site’s code?</p>
        <ul className="mt-3 space-y-2">
          {repos.map((r) => (
            <li key={r.full_name}>
              <form action="/api/github/repo" method="post" className="flex items-center gap-3">
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="repo" value={r.full_name} />
                <span className="font-mono text-slate-200">{r.full_name}</span>
                {r.private && <span className="text-xs text-slate-500">private</span>}
                <button className="ml-auto rounded-lg border border-line px-3 py-1 text-slate-300 hover:text-white">Use this repo</button>
              </form>
            </li>
          ))}
        </ul>
        {!repos.length && <p className="mt-2 text-slate-500">No repos granted yet. Reconnect and pick at least one.</p>}
      </>
    );
  }
  return (
    <>
      <p>Pick the repo with this site’s code. Antibody audits it and opens its fixes as pull requests you review. No install on your side.</p>
      <a
        href={`/api/github/new?project=${encodeURIComponent(projectId)}`}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-mint px-4 py-2 text-sm font-semibold text-ink hover:brightness-110"
      >
        Connect GitHub
      </a>
      {!readGithubApp() && (
        <p className="mt-2 text-xs text-slate-500">First time only: GitHub asks you to create the Antibody app, then which repos it can access.</p>
      )}
    </>
  );
}

function Step({ done, title, badge, children }: { done: boolean; title: string; badge?: string; children: React.ReactNode }) {
  return (
    <li>
      <Card className={`p-6 ${done ? "" : "ring-1 ring-mint/20"}`}>
        <div className="flex items-start gap-4">
          <span
            className={`mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-full border ${done ? "border-mint bg-mint/15 text-mint" : "border-line text-slate-500"}`}
          >
            {done ? <Icon name="check" className="h-4 w-4" /> : <span className="h-2 w-2 rounded-full bg-current" />}
          </span>
          <div className="min-w-0 flex-1 text-sm leading-relaxed text-slate-400">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-white">{title}</h2>
              {badge && <span className="rounded-full border border-line px-2 py-0.5 text-xs text-slate-400">{badge}</span>}
            </div>
            {children}
          </div>
        </div>
      </Card>
    </li>
  );
}
