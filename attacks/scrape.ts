// Rapid scraping: hammer the unprotected admin endpoint + homepage as fast as possible.
import { attackFetch, banner, requireVerifiedTarget, timed } from "./_lib.ts";

const origin = requireVerifiedTarget();
banner("scrape", origin);

const N = 40;
let ok = 0;
let blockedAt = 0;
let adminLeak = "";

const { ms } = await timed(async () => {
  for (let i = 1; i <= N; i++) {
    const res = await attackFetch(`${origin}/api/admin/stats`);
    if (res.status === 403) {
      blockedAt = i;
      break;
    }
    if (res.ok) {
      ok++;
      if (!adminLeak) {
        const s = await res.json();
        adminLeak = `${s.totalUsers} users, ${s.recentSignups?.length ?? 0} recent signups exposed`;
      }
    }
  }
});

if (blockedAt) {
  console.log(`Blocked after ${blockedAt} rapid requests (shield) in ${ms}ms.`);
} else {
  console.log(`Scraped admin stats ${ok}x in ${ms}ms with no auth — ${adminLeak}.`);
}
