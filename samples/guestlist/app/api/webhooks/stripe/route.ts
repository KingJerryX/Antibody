import { NextResponse } from "next/server";
import { markPaid } from "@/lib/state.ts";

// VULN (unverified webhook): any POST can mark a guest paid. The body is trusted as-is.
export async function POST(req: Request) {
  let guestId = NaN;
  try {
    const body = await req.json();
    guestId = Number(body?.guestId ?? body?.data?.object?.metadata?.guestId);
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  const guest = markPaid(guestId);
  if (!guest) return NextResponse.json({ error: "unknown guest" }, { status: 404 });
  return NextResponse.json({ received: true, guest });
}
