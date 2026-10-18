import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createShield } from "@antibody/shield";

// Next 16 renamed `middleware` -> `proxy` and runs it on the Node.js runtime (see
// node_modules/next/dist/docs/.../proxy.md). When SHIELD=on we route every /api and /supabase
// request through @antibody/shield and block anything it flags. SHIELD unset/off => fully exposed.

// Local port 4001 sets SHIELD=on. The Vercel deploy is the shielded copy, so it is on there too.
const SHIELD_ON = process.env.SHIELD === "on" || process.env.VERCEL === "1";

// Unsigned scan id for this host (`proj_localhost-4000`, or `proj_<domain>` on Vercel). A signed-in
// scan adds `-u<userId>`; open /live/<projectId> for the id this process actually posts.
function projectId(): string {
  const set = process.env.ANTIBODY_PROJECT_ID?.trim();
  if (set) return set;
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL?.replace(/^https?:\/\//, "").split("/")[0]?.toLowerCase();
  if (host) return `proj_${host.replace(/[^a-z0-9]+/g, "-")}`;
  return "proj_localhost-4000";
}

const shieldProjectId = projectId();
console.log(`[shield] blocks report to project ${shieldProjectId}`);

// Built once. Importing is cheap; it only does work when SHIELD_ON and it's actually called.
const shield = createShield({
  projectId: shieldProjectId,
  protect: (p: string) => p.startsWith("/api") || p.startsWith("/supabase"),
});

export async function proxy(request: NextRequest): Promise<Response> {
  if (SHIELD_ON) {
    const blocked = await shield(request);
    if (blocked) return blocked;
  }
  return NextResponse.next();
}

export const config = {
  // Only guard the dynamic surfaces; let static assets through.
  matcher: ["/api/:path*", "/supabase/:path*"],
};
