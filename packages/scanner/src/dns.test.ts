import { expect, it } from "vitest";
import { inspectDns } from "./dns.ts";

/** `key` is "TYPE name", as the resolver query string. */
function resolver(rows: Record<string, { status?: number; ad?: boolean; data?: string } | "fail">): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const row = rows[`${url.searchParams.get("type")} ${url.searchParams.get("name")}`];
    if (!row || row === "fail") return new Response("no", { status: 404 });
    return Response.json({
      Status: row.status ?? 0,
      AD: row.ad ?? false,
      Answer: row.data ? [{ data: row.data }] : [],
    });
  }) as typeof fetch;
}

it("passes a signed domain whose DMARC policy rejects forged mail", async () => {
  const fetchImpl = resolver({
    "A site.com": { ad: true, data: "1.2.3.4" },
    "DS site.com": { ad: true, data: "2371 13 2 AB" },
    "TXT _dmarc.site.com": { data: '"v=DMARC1; p=reject; rua=mailto:d@site.com"' },
  });
  const r = await inspectDns("site.com", fetchImpl);
  expect(r.issues).toEqual([]);
  expect(r.passed).toEqual(["dnssec", "dmarc"]);
});

it("flags a domain with no DS and no DMARC", async () => {
  const fetchImpl = resolver({
    "A site.com": { ad: false, data: "1.2.3.4" },
    "DS site.com": {},
    "TXT _dmarc.site.com": {},
  });
  const r = await inspectDns("site.com", fetchImpl);
  expect(r.passed).toEqual([]);
  expect(r.issues.map((i) => `${i.severity}:${i.title}`)).toEqual(["low:DNSSEC is not enabled", "medium:No DMARC record"]);
});

it("flags DNSSEC that publishes a DS but does not validate", async () => {
  const fetchImpl = resolver({
    "A site.com": { status: 2, ad: false },
    "DS site.com": { data: "2371 13 2 AB" },
    "TXT _dmarc.site.com": { data: "v=DMARC1; p=quarantine" },
  });
  const r = await inspectDns("site.com", fetchImpl);
  const dnssec = r.issues.find((i) => i.kind === "dnssec_disabled");
  expect(dnssec?.severity).toBe("medium");
  expect(dnssec?.evidence).toContain("SERVFAIL");
  expect(r.passed).toContain("dmarc");
});

it("treats p=none and pct=0 as monitor-only", async () => {
  const none = await inspectDns("site.com", resolver({
    "A site.com": { ad: true, data: "1.2.3.4" },
    "DS site.com": {},
    "TXT _dmarc.site.com": { data: '"v=DMARC1; p=none"' },
  }));
  expect(none.issues.map((i) => i.title)).toEqual(["DMARC does not block forged mail"]);

  const pct = await inspectDns("site.com", resolver({
    "A site.com": { ad: true, data: "1.2.3.4" },
    "DS site.com": {},
    "TXT _dmarc.site.com": { data: '"v=DMARC1; p=reject; pct=0"' },
  }));
  expect(pct.issues[0]?.evidence).toContain("pct=0");
});

it("uses the parent DMARC record when the subdomain has none", async () => {
  const r = await inspectDns("www.site.com", resolver({
    "A www.site.com": { ad: true, data: "1.2.3.4" },
    "DS www.site.com": {},
    "DS site.com": { data: "2371 13 2 AB" },
    "TXT _dmarc.www.site.com": {},
    "TXT _dmarc.site.com": { data: '"v=DMARC1; p=reject"' },
  }));
  expect(r.issues).toEqual([]);
  expect(r.passed).toContain("dmarc");
});

it("skips both checks when the resolver is unreachable", async () => {
  const fetchImpl = (async () => {
    throw new Error("offline");
  }) as typeof fetch;
  const r = await inspectDns("site.com", fetchImpl);
  expect(r.issues).toEqual([]);
  expect(r.passed).toEqual([]);
  expect(r.skipped.map((s) => s.split(".")[0])).toEqual(["DNSSEC check did not run", "DMARC check did not run"]);
});

it("does not look up DNS for an IP address", async () => {
  let called = false;
  const fetchImpl = (async () => {
    called = true;
    return new Response("no");
  }) as typeof fetch;
  const r = await inspectDns("203.0.113.5", fetchImpl);
  expect(called).toBe(false);
  expect(r.passed).toEqual(["dnssec", "dmarc"]);
});
