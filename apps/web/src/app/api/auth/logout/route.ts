import { SESSION_COOKIE, cookie } from "@/lib/auth";

export async function POST() {
  return new Response(null, { status: 303, headers: { location: "/", "set-cookie": cookie(SESSION_COOKIE, "", 0) } });
}
