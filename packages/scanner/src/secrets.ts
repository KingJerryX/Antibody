// Secret + Supabase detectors. Pure string in, structured out — no network, so trivially testable.

export interface SecretHit {
  kind: string; // human label for the finding title
  /** Redacted to first 4 chars + "…". Never the whole secret. */
  redacted: string;
}

export interface SupabaseHit {
  url?: string;
  anonKey?: string; // redacted
}

export const redact = (s: string): string => (s.length <= 4 ? s : s.slice(0, 4) + "…");

// First match wins per family; order matters (Anthropic before OpenAI, since both start "sk-").
const SECRET_PATTERNS: { kind: string; re: RegExp }[] = [
  { kind: "Anthropic API key", re: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  // Plain OpenAI (sk-<alnum>) won't swallow sk-ant- because the char after "sk-" there is a letter run ending at a hyphen.
  { kind: "OpenAI API key", re: /sk-proj-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{20,}/g },
  { kind: "Stripe secret key", re: /sk_(?:live|test)_[A-Za-z0-9]{20,}/g },
  { kind: "AWS access key", re: /AKIA[0-9A-Z]{16}/g },
];

const JWT_RE = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

/** Decode a JWT payload (middle segment) without verifying the signature. Null if it isn't JSON. */
function jwtRole(token: string): string | undefined {
  const mid = token.split(".")[1];
  if (!mid) return undefined;
  try {
    const json = Buffer.from(mid, "base64url").toString("utf8");
    const role = JSON.parse(json)?.role;
    return typeof role === "string" ? role : undefined;
  } catch {
    return undefined;
  }
}

/** Scan one blob of HTML or JS. Dedupes by redacted value so the same key in two bundles reports once. */
export function scanSecrets(text: string): SecretHit[] {
  const seen = new Set<string>();
  const hits: SecretHit[] = [];
  const add = (kind: string, raw: string) => {
    const key = kind + ":" + raw;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push({ kind, redacted: redact(raw) });
  };
  for (const { kind, re } of SECRET_PATTERNS) {
    for (const m of text.matchAll(re)) add(kind, m[0]);
  }
  for (const m of text.matchAll(JWT_RE)) {
    if (jwtRole(m[0]) === "service_role") add("Supabase service_role key", m[0]);
  }
  return hits;
}

/** Find a Supabase project URL + anon (public) key embedded in a bundle. */
export function findSupabase(text: string): SupabaseHit {
  const out: SupabaseHit = {};

  // createClient("<url>", "<anonKey>")
  const cc = text.match(/createClient\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']/);
  if (cc) {
    out.url = cc[1];
    // keep the real key below for role check; redact at the end
    out.anonKey = cc[2];
  }

  // SUPABASE_URL = "<url>" (const or NEXT_PUBLIC_ env inlined), else any *.supabase.co
  if (!out.url) {
    const named = text.match(/SUPABASE_URL["']?\s*[=:]\s*["'](https?:\/\/[^"']+)["']/);
    const u = named?.[1] ?? text.match(/https:\/\/[a-z0-9]{8,}\.supabase\.co/)?.[0];
    if (u) out.url = u.replace(/\/+$/, "");
  }

  // anon key = a JWT whose role is "anon" (if createClient didn't already give one)
  if (!out.anonKey) {
    for (const m of text.matchAll(JWT_RE)) {
      if (jwtRole(m[0]) === "anon") {
        out.anonKey = m[0];
        break;
      }
    }
  }
  return out;
}
