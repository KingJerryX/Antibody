import { convertManifestCode, installUrl, saveGithubApp } from "@antibody/core";

/** GitHub redirects here after the owner creates the app from our manifest. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  // The signed install state from /api/github/new; /api/github/installed checks it.
  const state = params.get("state") ?? "";
  if (!code) return Response.json({ error: "Missing code from GitHub" }, { status: 400 });

  const app = await convertManifestCode(code);
  await saveGithubApp(app);
  return Response.redirect(installUrl(app, state), 302);
}
