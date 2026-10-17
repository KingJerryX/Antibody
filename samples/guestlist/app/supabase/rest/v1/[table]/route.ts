import { NextResponse } from "next/server";
import { listGuests } from "@/lib/state.ts";

// VULN (Supabase RLS disabled): a stand-in for PostgREST. Any anon key can read every row.
// The key ships in the browser bundle (see Party.tsx).

const TABLES: Record<string, () => unknown[]> = {
  guests: () => listGuests(),
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
  if (!anonKey(req)) {
    return NextResponse.json({ message: "No API key found in request" }, { status: 401 });
  }
  const rows = TABLES[table];
  if (!rows) {
    return NextResponse.json({ message: `relation "public.${table}" does not exist` }, { status: 404 });
  }
  return NextResponse.json(rows());
}
