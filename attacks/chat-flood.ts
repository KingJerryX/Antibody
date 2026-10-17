// No rate limit: spam POST /api/chat and watch the "AI spend" counter climb with no ceiling.
import { banner, requireVerifiedTarget } from "./_lib.ts";

const origin = requireVerifiedTarget();
banner("chat-flood", origin);

const N = 50;
let ok = 0;
let blockedAt = 0;
let lastSpend = 0;

for (let i = 1; i <= N; i++) {
  const res = await fetch(`${origin}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: `spam ${i}` }),
  });
  if (res.status === 403 || res.status === 429) {
    blockedAt = i;
    break;
  }
  if (res.ok) {
    ok++;
    const data = await res.json();
    if (typeof data?.aiSpend === "number") lastSpend = data.aiSpend;
  }
}

if (blockedAt) {
  console.log(`Blocked after ${blockedAt} requests (shield). AI spend driven to $${lastSpend.toFixed(2)} before the block.`);
} else {
  console.log(`Sent ${ok} unthrottled chat calls. AI spend driven to $${lastSpend.toFixed(2)} — no rate limit.`);
}
