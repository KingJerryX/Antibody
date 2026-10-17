// Secret + Supabase detectors. Pure string in, structured out — no network, so trivially testable.

interface SecretHit {
  kind: string; // human label for the finding title
  /** Redacted to first 4 chars + "…". Never the whole secret. */
  redacted: string;
}

interface SupabaseHit {
  url?: string;
  /** Raw key: used in memory for the RLS probe only; redact before it reaches a finding. */
  anonKey?: string;
}

export const redact = (s: string): string => (s.length <= 4 ? s : s.slice(0, 4) + "…");

// Every pattern runs over the whole text; each match is reported once.
const SECRET_PATTERNS: { kind: string; re: RegExp }[] = [
  { kind: "Anthropic API key", re: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  // Plain OpenAI (sk-<20+ alnum>) can't match sk-ant-... : the hyphen after "ant" breaks the run.
  { kind: "OpenAI API key", re: /sk-proj-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{20,}/g },
  { kind: "Stripe secret key", re: /sk_(?:live|test)_[A-Za-z0-9]{20,}/g },
  { kind: "AWS access key", re: /AKIA[0-9A-Z]{16}/g },
  { kind: "GitHub token", re: /gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/g },
  { kind: "Slack token", re: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
  // user:password@ — the password is the secret. The match is redacted before it is stored.
  { kind: "Database URL", re: /(?:postgres|postgresql|mysql|mongodb(?:\+srv)?):\/\/[^\s'"@:]+:[^\s'"@]+@[^\s'"]+/g },
  { kind: "Private key", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
];

const JWT_RE = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

/** The `role` claim of a JWT payload, decoded without verifying the signature. */
function jwtRole(token: string): string | undefined {
  try {
    const role = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"))?.role;
    return typeof role === "string" ? role : undefined;
  } catch {
    return undefined;
  }
}

/** Scan one blob of HTML or JS. Dedupes by raw value so the same key in two bundles reports once. */
export function scanSecrets(text: string): SecretHit[] {
  const seen = new Set<string>();
  const hits: SecretHit[] = [];
  const add = (kind: string, raw: string) => {
    if (seen.has(raw)) return;
    seen.add(raw);
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
  // createClient("<url>", "<anonKey>"), else SUPABASE_URL = "<url>" (const or inlined NEXT_PUBLIC_ env), else any *.supabase.co
  const cc = text.match(/createClient\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']/);
  const url =
    cc?.[1] ??
    text.match(/SUPABASE_URL["']?\s*[=:]\s*["'](https?:\/\/[^"']+)["']/)?.[1] ??
    text.match(/https:\/\/[a-z0-9]{8,}\.supabase\.co/)?.[0];
  // anon key = a JWT whose role is "anon" (if createClient didn't already give one)
  const anonKey = cc?.[2] ?? [...text.matchAll(JWT_RE)].find((m) => jwtRole(m[0]) === "anon")?.[0];
  return { url: url?.replace(/\/+$/, ""), anonKey };
}
