import { NextResponse } from "next/server";
import { USERS, publicUser } from "@/lib/seed.ts";

// VULN (Supabase RLS disabled): this mimics a Supabase PostgREST endpoint. With Row Level Security
// OFF, the anonymous public key can read every row of every table. The anon key ships in the
// browser bundle (see VibeClient.tsx), so anyone who views source can dump the whole database.
// ponytail: tiny hand-rolled PostgREST — ignores ?select / filters, just returns full tables.

const TABLES: Record<string, () => unknown[]> = {
  users: () => USERS.map(publicUser),
  profiles: () => USERS.map((u) => ({ id: u.id, name: u.name, bio: u.bio, plan: u.plan })),
  notes: () => USERS.flatMap((u) => u.notes.map((n) => ({ ...n, userId: u.id, owner: u.email }))),
};

function anonKey(req: Request): string | null {
  const apikey = req.headers.get("apikey");
  if (apikey) return apikey;
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7);
  return null;
}

export async function GET(req: Request, { params }: { params: Promise<{ table: string }> }) {
  const { table } = await params;
  // Any key is accepted (RLS disabled) — we only check a key is present, like real PostgREST.
  if (!anonKey(req)) {
    return NextResponse.json({ message: "No API key found in request" }, { status: 401 });
  }
  const rows = TABLES[table];
  if (!rows) {
    return NextResponse.json(
      { message: `relation "public.${table}" does not exist` },
      { status: 404 },
    );
  }
  // RLS disabled: every row, no filtering by caller identity.
  return NextResponse.json(rows());
}
