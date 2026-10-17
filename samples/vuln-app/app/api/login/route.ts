import { NextResponse } from "next/server";
import { USERS } from "@/lib/seed.ts";

// VULN (no brute-force / credential-stuffing protection): wrong password returns a clean 401,
// right password returns 200. No lockout, no rate limit, no delay — perfect for stuffing.
export async function POST(req: Request) {
  let email = "";
  let password = "";
  try {
    const body = await req.json();
    email = body?.email ?? "";
    password = body?.password ?? "";
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const user = USERS.find((u) => u.email.toLowerCase() === String(email).toLowerCase());
  if (!user || user.password !== password) {
    // The crisp 401 is exactly what makes stuffing cheap.
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, user: { id: user.id, name: user.name, email: user.email } });
}
