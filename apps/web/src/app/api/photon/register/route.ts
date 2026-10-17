import { proxyToOrchestrator, webUrl } from "@/lib/server";
import { ownedProject } from "@/lib/auth";

/** Setup page form: register the user's phone with Photon (via the orchestrator), then back to the page. */
export async function POST(request: Request) {
  const form = await request.formData();
  const projectId = String(form.get("projectId") ?? "");
  const phone = String(form.get("phone") ?? "");
  if (!(await ownedProject(projectId)).project) return Response.json({ error: "Sign in as this project's owner first" }, { status: 403 });
  const res = await proxyToOrchestrator("/photon/register", { projectId, phone });
  const page = new URL(`${webUrl()}/connect/${encodeURIComponent(projectId)}`);
  if (!res.ok) {
    const { error } = (await res.json().catch(() => ({}))) as { error?: string };
    page.searchParams.set("phoneError", error ?? `Couldn't register that number (${res.status}).`);
  }
  return Response.redirect(page, 303);
}
