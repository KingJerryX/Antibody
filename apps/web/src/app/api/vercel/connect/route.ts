import { cookie, currentUser, mockSignIn, sign, signInRedirect } from "@/lib/auth";
import { VERCEL_COOKIE, vercelIntegration } from "@/lib/vercel";

/** "Connect Vercel": install the Antibody Vercel Integration, which comes back to /api/vercel/callback. */
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return signInRedirect(request);
  const integration = vercelIntegration();
  if (!integration) {
    // Mock mode says so instead of pretending: nothing is imported without the integration.
    const why = mockSignIn() ? "mock" : "off";
    return Response.redirect(new URL(`/sites?vercel=${why}`, request.url), 302);
  }
  // Marks that this browser started the install here, so the callback lands back on Your sites, not on Vercel.
  return new Response(null, {
    status: 302,
    headers: { location: `https://vercel.com/integrations/${encodeURIComponent(integration.slug)}/new`, "set-cookie": cookie(VERCEL_COOKIE, sign({ u: user.id }, 1800), 1800) },
  });
}
