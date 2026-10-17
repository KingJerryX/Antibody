import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createShield } from "@antibody/shield";

// Next 16 renamed `middleware` -> `proxy` and runs it on the Node.js runtime (see
// node_modules/next/dist/docs/.../proxy.md). When SHIELD=on we route every /api and /supabase
// request through @antibody/shield and block anything it flags. SHIELD unset/off => fully exposed.

const SHIELD_ON = process.env.SHIELD === "on";

// Built once. Importing is cheap; it only does work when SHIELD_ON and it's actually called.
const shield = createShield({
  // Same id the web app gives http://localhost:4000, so blocks land on that project's /live page.
  projectId: "proj_localhost-4000",
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
