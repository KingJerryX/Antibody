import { NextResponse } from "next/server";
import { USERS } from "@/lib/seed.ts";
import { state } from "@/lib/state.ts";

// VULN (unprotected admin): no auth, no role check. Anyone hitting /api/admin/stats gets
// user counts, plan breakdown, AI spend, and the most recent signups (with emails).
export async function GET() {
  const recent = [...USERS]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5)
    .map((u) => ({ id: u.id, name: u.name, email: u.email, createdAt: u.createdAt }));

  return NextResponse.json({
    totalUsers: USERS.length,
    proUsers: USERS.filter((u) => u.plan === "pro").length,
    aiSpendUsd: state.aiSpend,
    chatCalls: state.chatCalls,
    recentSignups: recent,
  });
}
