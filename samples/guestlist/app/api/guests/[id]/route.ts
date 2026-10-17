import { NextResponse } from "next/server";
import { guestById } from "@/lib/state.ts";

// VULN (IDOR): returns any guest's phone, email, and plus-one note by id.
// Nothing checks who is asking. Walking /api/guests/1, /api/guests/2, ... dumps the list.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guest = guestById(Number(id));
  if (!guest) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(guest);
}
