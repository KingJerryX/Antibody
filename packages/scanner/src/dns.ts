// Public DNS checks. These ask a resolver about the domain; they never connect to the site.
// A lookup that fails is skipped, so a resolver outage is not reported as a missing record.
import type { FindingKind, Severity } from "@antibody/core";

export interface DnsIssue {
  kind: FindingKind;
  severity: Severity;
  title: string;
  plainEnglish: string;
  impact: string;
  evidence: string;
  fixHint: string;
}

export interface DnsResult {
  issues: DnsIssue[];
  passed: string[];
  skipped: string[];
}

const RESOLVERS = ["https://cloudflare-dns.com/dns-query", "https://dns.google/resolve"];
const DS = 43;
const TXT = 16;

interface Query {
  status: number;
  ad: boolean;
  answers: { type: number; data: string }[];
}

/** False for localhost, IP addresses, and single-label names. Those have no DNSSEC or DMARC to publish. */
export function dnsApplies(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || !host.includes(".")) return false;
  if (host.includes(":") || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  return true;
}

/** Full name down to the registered-looking name (`a.b.example.com` → that, `b.example.com`, `example.com`). */
function zoneNames(hostname: string): string[] {
  const labels = hostname.toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
  const names: string[] = [];
  for (let i = 0; i <= labels.length - 2 && names.length < 6; i++) names.push(labels.slice(i).join("."));
  return names;
}

export async function inspectDns(hostname: string, fetchImpl: typeof fetch): Promise<DnsResult> {
  if (!dnsApplies(hostname)) return { issues: [], passed: ["dnssec", "dmarc"], skipped: [] };
  const names = zoneNames(hostname);
  const [address, ds, txt] = await Promise.all([
    query(fetchImpl, hostname, "A"),
    Promise.all(names.map((name) => query(fetchImpl, name, "DS"))),
    Promise.all(names.map((name) => query(fetchImpl, `_dmarc.${name}`, "TXT"))),
  ]);

  const dnssec = judgeDnssec(hostname, names, address, ds);
  const dmarc = judgeDmarc(names, txt);
  return {
    issues: [...dnssec.issues, ...dmarc.issues],
    passed: [...dnssec.passed, ...dmarc.passed],
    skipped: [...dnssec.skipped, ...dmarc.skipped],
  };
}

function judgeDnssec(hostname: string, names: string[], address: Query | undefined, ds: (Query | undefined)[]): Pick<DnsResult, "issues" | "passed" | "skipped"> {
  const answered = ds.filter((q): q is Query => !!q);
  const signedAt = names.filter((_, i) => ds[i]?.answers.some((a) => a.type === DS));
  if (address?.ad) return { issues: [], passed: ["dnssec"], skipped: [] };
  if (!address && answered.length === 0) {
    return { issues: [], passed: [], skipped: ["DNSSEC check did not run. The DNS lookup failed."] };
  }
  if (signedAt.length && address && (address.status === 2 || !address.ad)) {
    return {
      issues: [
        issue(
          "dnssec_disabled",
          "medium",
          "DNSSEC does not validate",
          "The domain publishes a DNSSEC key, but a validating resolver still does not trust the answer.",
          "Resolvers that check DNSSEC may fail the lookup. Everyone else can still be sent to a fake site.",
          `DS record at ${signedAt[0]}. Lookup of ${hostname} was not authenticated${address.status === 2 ? " (SERVFAIL)" : " (AD=0)"}.`,
          "Re-sign the zone and make sure the DS record at the registrar matches the current key.",
        ),
      ],
      passed: [],
      skipped: [],
    };
  }
  if (signedAt.length) return { issues: [], passed: ["dnssec"], skipped: [] };
  if (ds.every((q) => q && (q.status === 0 || q.status === 3)) && address?.status !== 2) {
    return {
      issues: [
        issue(
          "dnssec_disabled",
          "low",
          "DNSSEC is not enabled",
          "This domain's DNS answers are not signed, so someone on the network path can forge them.",
          "A forged answer can send visitors to a copy of the site, or redirect mail and API calls that use this name.",
          `No DS record at ${names[names.length - 1]}. The answer for ${hostname} was not authenticated.`,
          "Turn on DNSSEC at the registrar and publish the DS record it gives you.",
        ),
      ],
      passed: [],
      skipped: [],
    };
  }
  return { issues: [], passed: [], skipped: ["DNSSEC check did not run. The DNS lookup failed."] };
}

function judgeDmarc(names: string[], txt: (Query | undefined)[]): Pick<DnsResult, "issues" | "passed" | "skipped"> {
  const checked = names.map((name) => `_dmarc.${name}`);
  for (let i = 0; i < names.length; i++) {
    const q = txt[i];
    if (!q) return { issues: [], passed: [], skipped: ["DMARC check did not run. The DNS lookup failed."] };
    const raw = q.answers.filter((a) => a.type === TXT).map((a) => txtText(a.data)).find((t) => /^v\s*=\s*DMARC1\b/i.test(t));
    if (!raw) continue;
    const policy = dmarcPolicy(raw);
    const where = `_dmarc.${names[i]}`;
    if (policy === "quarantine" || policy === "reject") return { issues: [], passed: ["dmarc"], skipped: [] };
    if (policy === "none" || policy === "pct0") {
      return {
        issues: [
          issue(
            "dmarc_missing",
            "low",
            "DMARC does not block forged mail",
            policy === "pct0"
              ? "The domain has a DMARC policy, then tells providers to apply it to none of the mail."
              : "The domain monitors forged email and still asks providers to deliver it.",
            "Spoofed messages from this domain still reach inboxes.",
            `${where} says ${raw.slice(0, 180)}`,
            "Move the policy to p=quarantine, then p=reject, once legitimate mail passes SPF or DKIM.",
          ),
        ],
        passed: [],
        skipped: [],
      };
    }
    return {
      issues: [
        issue(
          "dmarc_missing",
          "medium",
          "DMARC record is invalid",
          "There is a DMARC record, but it does not say what to do with forged mail.",
          "Providers ignore a record with no policy, so spoofed mail is still delivered.",
          `${where} says ${raw.slice(0, 180)}`,
          "Set p=quarantine or p=reject on that TXT record.",
        ),
      ],
      passed: [],
      skipped: [],
    };
  }
  if (txt.some((q) => !q)) return { issues: [], passed: [], skipped: ["DMARC check did not run. The DNS lookup failed."] };
  return {
    issues: [
      issue(
        "dmarc_missing",
        "medium",
        "No DMARC record",
        "Nothing tells mail servers what to do with messages that fake this domain.",
        "Anyone can send email that looks like it came from this domain.",
        `No DMARC TXT record at ${checked.join(" or ")}.`,
        "Publish a TXT record at _dmarc for this domain, starting with v=DMARC1 and p=quarantine or p=reject.",
      ),
    ],
    passed: [],
    skipped: [],
  };
}

/** `reject` / `quarantine` enforce. `none` and `pct=0` only monitor. Anything else is unusable. */
function dmarcPolicy(raw: string): "reject" | "quarantine" | "none" | "pct0" | "invalid" {
  const tags = new Map<string, string>();
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim().toLowerCase();
    const value = part.slice(eq + 1).trim().toLowerCase();
    if (key) tags.set(key, value);
  }
  if (tags.get("pct") === "0") return "pct0";
  const p = tags.get("p");
  if (p === "reject" || p === "quarantine" || p === "none") return p;
  return "invalid";
}

function txtText(data: string): string {
  const quoted = [...data.matchAll(/"((?:\\.|[^"\\])*)"/g)].map((m) => m[1]);
  return (quoted.length ? quoted.join("") : data).trim();
}

async function query(fetchImpl: typeof fetch, name: string, type: "A" | "DS" | "TXT"): Promise<Query | undefined> {
  for (const base of RESOLVERS) {
    const hit = await queryAt(fetchImpl, base, name, type);
    if (hit) return hit;
  }
  return;
}

async function queryAt(fetchImpl: typeof fetch, base: string, name: string, type: string): Promise<Query | undefined> {
  try {
    const url = `${base}?${new URLSearchParams({ name, type })}`;
    const res = await fetchImpl(url, { headers: { accept: "application/dns-json" } });
    if (!res.ok) return;
    const body = (await res.json()) as { Status?: number; AD?: boolean; Answer?: { type?: number; data?: string }[] };
    if (typeof body.Status !== "number") return;
    const fallback = type === "DS" ? DS : type === "TXT" ? TXT : 1;
    const answers = Array.isArray(body.Answer) ? body.Answer.flatMap((a) => (typeof a.data === "string" ? [{ type: a.type ?? fallback, data: a.data }] : [])) : [];
    return { status: body.Status, ad: body.AD === true, answers };
  } catch {
    return;
  }
}

function issue(kind: FindingKind, severity: Severity, title: string, plainEnglish: string, impact: string, evidence: string, fixHint: string): DnsIssue {
  return { kind, severity, title, plainEnglish, impact, evidence, fixHint };
}
