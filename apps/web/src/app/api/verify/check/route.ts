import { updateDb } from "@antibody/core";
import { siteProvesOwnership } from "@antibody/scanner";
import { webUrl } from "@/lib/server";
import { ownedProject } from "@/lib/auth";

/** Setup page "Check now": look for the verify file (or meta tag) on the live site and save the answer. */
export async function POST(request: Request) {
  const projectId = String((await request.formData()).get("projectId") ?? "");
  const { project } = await ownedProject(projectId);
  if (!project) return Response.json({ error: "Sign in as this project's owner first" }, { status: 403 });
  const page = new URL(`${webUrl()}/connect/${encodeURIComponent(projectId)}`);
  const proven = await siteProvesOwnership(project.url);
  await updateDb((db) => {
    const p = db.projects.find((x) => x.id === projectId);
    if (!p) return;
    p.verifiedDomain = proven;
    if (proven) delete p.verifyPrUrl;
  });
  if (!proven) {
    const host = URL.parse(project.url)?.host ?? project.url;
    page.searchParams.set("verifyError", `${host}/.well-known/antibody-verify isn't live yet, or doesn't say "${host}". If you just merged, wait for the deploy to finish and check again.`);
  }
  return Response.redirect(page, 303);
}
