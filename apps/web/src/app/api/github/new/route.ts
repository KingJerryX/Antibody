import { appManifest, installUrl, readDb, readGithubApp } from "@antibody/core";
import { webUrl } from "@/lib/server";

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * "Connect GitHub". Once the Antibody GitHub App exists, go straight to installing it on a repo.
 * The first time, auto-submit GitHub's create-from-manifest form so the owner only clicks "Create".
 */
export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("project") ?? "";
  if (!readDb().projects.some((p) => p.id === projectId)) return Response.json({ error: "Unknown project" }, { status: 404 });

  const app = readGithubApp();
  if (app) return Response.redirect(installUrl(app, projectId), 302);

  const action = `https://github.com/settings/apps/new?state=${encodeURIComponent(projectId)}`;
  const manifest = escapeHtml(JSON.stringify(appManifest(webUrl())));
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Creating the Antibody GitHub App…</title>
<body style="font-family:system-ui;background:#0b0d12;color:#cbd5e1;display:grid;place-items:center;height:100vh">
<form method="post" action="${action}"><input type="hidden" name="manifest" value="${manifest}">
<p>Taking you to GitHub to create the Antibody app…</p><button>Continue to GitHub</button></form>
<script>document.forms[0].submit()</script></body>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
