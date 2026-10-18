// Shared-secret check for calls between Antibody's own services (web app, orchestrator, shield).
import { timingSafeEqual } from "node:crypto";

/** "Bearer <token>" check in constant time, so the response time doesn't leak how much of a guess was right. */
export function bearerMatches(header: string | null | undefined, token: string): boolean {
  const got = Buffer.from(header ?? "");
  const want = Buffer.from(`Bearer ${token}`);
  return got.length === want.length && timingSafeEqual(got, want);
}
