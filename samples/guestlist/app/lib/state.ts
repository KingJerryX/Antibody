// Shared guest list. ponytail: module-global, in-memory; resets on restart. Fine for a demo.
import { GUESTS, type Guest } from "./seed.ts";

const g = globalThis as unknown as { __guestlist?: Guest[] };
g.__guestlist ??= GUESTS.map((guest) => ({ ...guest }));

const guests = () => g.__guestlist!;

export function listGuests(): Guest[] {
  return guests().map((guest) => ({ ...guest }));
}

export function guestById(id: number): Guest | undefined {
  const guest = guests().find((row) => row.id === id);
  return guest ? { ...guest } : undefined;
}

/** Marks a guest paid. Returns the updated row, or undefined if the id is unknown. */
export function markPaid(id: number): Guest | undefined {
  const guest = guests().find((row) => row.id === id);
  if (!guest) return undefined;
  guest.paid = true;
  return { ...guest };
}
