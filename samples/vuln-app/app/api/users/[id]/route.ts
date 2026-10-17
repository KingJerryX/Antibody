import { NextResponse } from "next/server";
import { USERS } from "@/lib/seed.ts";

// VULN (IDOR): returns ANY user's full profile by id with no auth check and no ownership check.
// An attacker just walks /api/users/1, /api/users/2, ... and scrapes every email.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = USERS.find((u) => u.id === Number(id));
  if (!user) return NextResponse.json({ error: "not found" }, { status: 404 });
  // Leaks email + bio + plan with zero authorization.
  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    bio: user.bio,
    plan: user.plan,
    createdAt: user.createdAt,
  });
}
