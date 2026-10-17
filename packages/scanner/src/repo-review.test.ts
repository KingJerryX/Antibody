import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { patternFindings, reviewRepo, verifiedGrokFindings } from "./repo-review.ts";

const KEY = "sk-proj-DEMOFAKEKEY000000000000000000000000";

describe("pattern review", () => {
  it("flags leaks, crashes, and unbounded reads, and keeps secrets out of the evidence", () => {
    const findings = patternFindings("p", [
      {
        file: "app/api/search/route.ts",
        text: ["export async function GET(req: Request) {", "  const q = new URL(req.url).searchParams.get('q') ?? '';", "  const rows = await db.query(`select * from notes where title like '%${q}%'`);", "  return NextResponse.json({ error: err.stack });", "}"].join("\n"),
      },
      {
        file: "app/_components/App.tsx",
        text: ['"use client";', `const OPENAI_API_KEY = "${KEY}";`, "const rows = await supabase.from('users');", "debugger;"].join("\n"),
      },
      { file: "app/lib/auth.ts", text: "export interface User { password: string }\nif (user.password !== password) return null;\n" },
      { file: "app/lib/safe.ts", text: "const { data } = await supabase.from('notes').select('*').limit(20);\n" },
      { file: ".env", text: "SUPER_SECRET=do-not-copy\n" },
      { file: ".env.example", text: "SUPER_SECRET=\n" },
    ]);
    const kinds = findings.map((f) => `${f.kind} ${f.location?.file}:${f.location?.line}`);
    expect(kinds).toContain("sql_injection app/api/search/route.ts:3");
    expect(kinds).toContain("data_leak app/api/search/route.ts:4");
    expect(kinds).toContain("secret_in_bundle app/_components/App.tsx:2");
    expect(kinds).toContain("optimization app/_components/App.tsx:3");
    expect(kinds).toContain("bug app/_components/App.tsx:4");
    expect(kinds).toContain("data_leak app/lib/auth.ts:2");
    expect(kinds).toContain("data_leak .env:1");
    expect(findings.some((f) => f.location?.file === "app/lib/safe.ts")).toBe(false);
    expect(findings.some((f) => f.location?.file === ".env.example")).toBe(false);
    expect(JSON.stringify(findings)).not.toContain(KEY);
    expect(JSON.stringify(findings)).not.toContain("do-not-copy");
    expect(findings.find((f) => f.kind === "secret_in_bundle")?.evidence).toContain("sk-p…");
  });
});

describe("grok review", () => {
  const tree = new Map([["app/api/chat/route.ts", "export async function POST() {\n  return NextResponse.json({ reply });\n}\n"]]);

  it("keeps a finding only when the quote is that line", () => {
    const kept = verifiedGrokFindings("p", tree, {
      findings: [
        { kind: "missing_rate_limit", severity: "high", title: "No limit on chat", plainEnglish: "Anyone can call this as fast as they want.", impact: "The AI bill grows.", fixHint: "Add a per-IP limit.", file: "app/api/chat/route.ts", line: 2, quote: "return NextResponse.json({ reply });" },
        { kind: "bug", severity: "high", title: "Invented", plainEnglish: "Not on this line.", impact: "", fixHint: "", file: "app/api/chat/route.ts", line: 2, quote: "this line is not in the file" },
        { kind: "bug", severity: "high", title: "Escape", plainEnglish: "Path leaves the repo.", impact: "", fixHint: "", file: "../secret.ts", line: 1, quote: "export async function POST() {" },
        { kind: "missing_security_headers", severity: "low", title: "Headers", plainEnglish: "Not a source finding.", impact: "", fixHint: "", file: "app/api/chat/route.ts", line: 1, quote: "export async function POST() {" },
      ],
    });
    expect(kept).toHaveLength(1);
    expect(kept[0].kind).toBe("missing_rate_limit");
    expect(kept[0].location).toEqual({ file: "app/api/chat/route.ts", line: 2 });
  });

  it("redacts a secret inside a quoted line", () => {
    const files = new Map([["app/key.ts", `const key = "${KEY}";\n`]]);
    const kept = verifiedGrokFindings("p", files, {
      findings: [{ kind: "secret_in_bundle", severity: "critical", title: "Key", plainEnglish: "The key is in source.", impact: "It can be copied.", fixHint: "Rotate it.", file: "app/key.ts", line: 1, quote: `const key = "${KEY}";` }],
    });
    expect(kept).toHaveLength(1);
    expect(kept[0].evidence).not.toContain(KEY);
    expect(kept[0].evidence).toContain("sk-p…");
  });
});

describe("reviewRepo", () => {
  const dirs: string[] = [];
  const env = { key: process.env.XAI_API_KEY, model: process.env.XAI_MODEL, mock: process.env.ANTIBODY_MOCK };
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
    if (env.key === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = env.key;
    if (env.mock === undefined) delete process.env.ANTIBODY_MOCK;
    else process.env.ANTIBODY_MOCK = env.mock;
  });

  function scratch(): string {
    const dir = mkdtempSync(join(tmpdir(), "antibody-review-"));
    dirs.push(dir);
    writeFileSync(join(dir, "app.ts"), "export const n = 1;\n");
    return dir;
  }

  it("ignores Next build output", async () => {
    delete process.env.XAI_API_KEY;
    const dir = scratch();
    const built = join(dir, ".next-shielded", "chunks");
    mkdirSync(built, { recursive: true });
    writeFileSync(join(built, "runtime.js"), "eval(input);\n");
    const result = await reviewRepo(dir, "p");
    expect(result.findings).toEqual([]);
  });

  it("skips Grok when no key is set and still returns pattern findings", async () => {
    delete process.env.XAI_API_KEY;
    delete process.env.ANTIBODY_MOCK;
    let called = false;
    const dir = scratch();
    const result = await reviewRepo(dir, "p", { fetchImpl: (() => { called = true; return Promise.resolve(new Response()); }) as typeof fetch });
    expect(called).toBe(false);
    expect(result.findings).toEqual([]);
    expect(result.skipped?.[0]).toContain("XAI_API_KEY");
  });

  it("skips Grok in mock mode even when a key is set", async () => {
    process.env.XAI_API_KEY = "xai-test";
    process.env.ANTIBODY_MOCK = "on";
    let called = false;
    const dir = scratch();
    const result = await reviewRepo(dir, "p", { fetchImpl: (() => { called = true; return Promise.resolve(new Response()); }) as typeof fetch });
    expect(called).toBe(false);
    expect(result.skipped?.[0]).toContain("mock mode");
  });

  it("accepts a Grok finding whose quote matches the file", async () => {
    process.env.XAI_API_KEY = "xai-test";
    delete process.env.ANTIBODY_MOCK;
    const dir = scratch();
    const fetchImpl = (async () =>
      Response.json({
        choices: [{ message: { content: JSON.stringify({ findings: [{ kind: "bug", severity: "medium", title: "Unused export", plainEnglish: "This file exports a constant and nothing else.", impact: "Dead code.", fixHint: "Delete it if nothing imports it.", file: "app.ts", line: 1, quote: "export const n = 1;" }] }) } }],
      })) as typeof fetch;
    const result = await reviewRepo(dir, "p", { fetchImpl });
    expect(result.findings.map((f) => f.kind)).toEqual(["bug"]);
    expect(result.note).toContain("Grok review: 1 more");
    expect(result.skipped).toBeUndefined();
  });
});
