import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { installationRepos, readGithubApp, startCodeFor, updateDb, type Project } from "@antibody/core";
import { currentUser, owns, projectIdFor } from "@/lib/auth";
import { Card, Icon } from "@/components/ui";
import { proxyToOrchestrator, readStore } from "@/lib/server";
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

/** Photon error text is safe to show; the orchestrator's own 503 includes an internal URL, so keep that generic. */
function inboxNote(status: number, body: string): string {
  if (status === 502) {
    try {
      const msg = JSON.parse(body).error;
      if (typeof msg === "string" && msg.length < 180 && !/key|bearer|secret|token/i.test(msg)) return `Couldn't check iMessage: ${msg}`;
    } catch {
      /* body was not JSON */
    }
  }
  return "Couldn't check iMessage just now. This page retries every few seconds.";
}

async function Setup({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Search }) {
  await connection();
  const { projectId } = await params;
  let db = await readStore();
  const project = db.projects.find((p) => p.id === projectId);
  if (!project) notFound();

  // Setup (GitHub, proof, phones, the START code) is the owner's alone.
  const user = await currentUser();
  if (!owns(user, project)) {
    if (user && project.ownerId === undefined) {
      // A scan made before signing in: set up your own project for the same site.
      const mine = projectIdFor(URL.parse(project.url)?.host ?? project.name, user);
      await updateDb((d) => {
        if (!d.projects.some((p) => p.id === mine)) {
          d.projects.push({ id: mine, name: project.name, url: project.url, verifiedDomain: false, createdAt: new Date().toISOString(), ownerId: user.id, ownerLogin: user.login });
        }
      });
      redirect(`/connect/${mine}`);
    }
    return <SignInGate projectId={projectId} name={project.name} signedIn={Boolean(user)} />;
  }

  // The START code proves a phone belongs to someone who can see this page (localhost only).
  const code = await startCodeFor(projectId);
  let memory = db.memory.find((m) => m.projectId === projectId);
  let linked = memory?.teammates ?? [];
  let inboxError: string | undefined;
  let inboxEmpty = false;
  // The orchestrator only sees texts while it is awake. Ask it to read the inbox before deciding the step is still waiting.
  if (!linked.length) {
    const res = await proxyToOrchestrator("/photon/poll", {}).catch(() => undefined);
    const body = res ? await res.text() : "";
    if (res?.ok) {
      console.log(`[photon] poll ${body.slice(0, 500)}`);
      try {
        const parsed = JSON.parse(body) as { inbox?: number; handled?: number };
        inboxEmpty = !parsed.handled && typeof parsed.inbox === "number";
      } catch {
        /* poll body was not JSON */
      }
    } else console.error(`[photon] poll ${res?.status ?? "down"} ${body.slice(0, 200)}`);
    if (!res?.ok) inboxError = inboxNote(res?.status ?? 503, body);
    db = await readStore();
    memory = db.memory.find((m) => m.projectId === projectId);
    linked = memory?.teammates ?? [];
    if (linked.length) inboxError = undefined;
  }
  // Phones registered with Photon from this page, each with the Antibody line Photon assigned it.
  const registered = memory?.phoneLines ?? [];
  const search = await searchParams;
  const phoneError = search.phoneError?.slice(0, 300);
  const steps = [Boolean(project.repo), project.verifiedDomain, linked.length > 0];

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
        <Step done={Boolean(project.repo)} title="Connect GitHub">
          <GithubStep projectId={projectId} repo={project.repo} installationId={project.githubInstallationId} />
        </Step>

        <Step done={project.verifiedDomain} title="Connect Vercel">
          <VercelStep project={project} />
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
                  {inboxError ? (
                    <p role="alert" className="mt-2 text-xs text-red-300">
                      {inboxError}
                    </p>
                  ) : inboxEmpty ? (
                    <p role="status" className="mt-2 text-xs text-amber-200/90">
                      iMessage delivered those texts, but Photon has not stored them on this line yet. Send START one more time and leave this page open.
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">Antibody replies to confirm. Waiting for your text…</p>
                  )}
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
  const appReady = Boolean(await readGithubApp());
  return (
    <>
      <p>Pick the repo with this site’s code. Antibody audits it and opens its fixes as pull requests you review. No install on your side.</p>
      <a
        href={`/api/github/new?project=${encodeURIComponent(projectId)}`}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-mint px-4 py-2 text-sm font-semibold text-ink hover:brightness-110"
      >
        Connect GitHub
      </a>
      {!appReady && (
        <p className="mt-2 text-xs text-slate-500">First time only: GitHub asks you to create the Antibody app, then which repos it can access.</p>
      )}
    </>
  );
}

function SignInGate({ projectId, name, signedIn }: { projectId: string; name: string; signedIn: boolean }) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-white">Set up {name}</h1>
      <p className="mt-3 text-slate-400">
        {signedIn
          ? "This site is set up under another GitHub account. Sign in as that account to change it."
          : "Sign in with GitHub to connect your repo and Vercel, and get alerts. Your progress is saved to your account."}
      </p>
      {!signedIn && (
        <a href={`/api/auth/github?next=${encodeURIComponent(`/connect/${projectId}`)}`} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-mint px-4 py-2 text-sm font-semibold text-ink hover:brightness-110">
          Sign in with GitHub
        </a>
      )}
    </div>
  );
}

/** Live checks call the site's API with no login, so they only run on sites the owner proved through Vercel. */
function VercelStep({ project }: { project: Project }) {
  const host = URL.parse(project.url)?.host ?? project.name;
  if (project.verifiedDomain) return <p>Done. {host} is on your Vercel account, so every scan runs the live checks too.</p>;
  return (
    <>
      <p>
        Live checks call your site&apos;s API with no login, so they only run on sites you own. Connect the Vercel account that hosts {host}: Antibody
        reads your projects&apos; domains (read only), and this step completes on its own.
      </p>
      <a href="/api/vercel/connect" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-mint px-4 py-2 text-sm font-semibold text-ink hover:brightness-110">
        Connect Vercel
      </a>
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
