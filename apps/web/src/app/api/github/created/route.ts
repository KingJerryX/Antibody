import { convertManifestCode, installUrl, readDb, saveGithubApp } from "@antibody/core";

/** GitHub redirects here after the owner creates the app from our manifest. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  const projectId = params.get("state") ?? "";
  if (!code) return Response.json({ error: "Missing code from GitHub" }, { status: 400 });

  const app = await convertManifestCode(code);
  saveGithubApp(app);
  // Straight on to installing it, if we know which project asked.
  const known = (await readDb()).projects.some((p) => p.id === projectId);
  return Response.redirect(known ? installUrl(app, projectId) : app.html_url, 302);
}
