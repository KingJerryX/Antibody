import { afterEach, expect, it, vi } from "vitest";
import { logActivity, readDb, updateDb } from "./store.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

/** Minimal stand-in for Supabase's REST API on one table: GET, compare-and-swap PATCH, insert-if-absent POST. */
function fakeSupabase() {
  let row: { id: string; data: unknown; version: number } | undefined;
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  vi.stubGlobal("fetch", async (input: string, init: RequestInit) => {
    const url = new URL(input);
    expect(url.pathname).toBe("/rest/v1/antibody_store");
    expect(new Headers(init.headers).get("apikey")).toBe("service-key");
    await new Promise((r) => setTimeout(r, Math.random() * 5)); // interleave concurrent writers
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    if (init.method === "GET") return json(row ? [{ data: structuredClone(row.data), version: row.version }] : []);
    if (init.method === "POST") {
      if (row) return json([]); // resolution=ignore-duplicates
      row = body;
      return json([row]);
    }
    if (init.method === "PATCH") {
      if (!row || `eq.${row.version}` !== url.searchParams.get("version")) return json([]);
      row = { ...row, ...body };
      return json([row]);
    }
    throw new Error(`unexpected ${init.method}`);
  });
}

it("keeps every write when writers race on Supabase", async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co/";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  fakeSupabase();

  expect((await readDb()).projects).toEqual([]);
  await Promise.all(Array.from({ length: 20 }, (_, i) => logActivity({ projectId: "p", type: "finding", title: `t${i}` })));
  const titles = (await readDb()).activity.map((a) => a.title).sort();
  expect(titles).toHaveLength(20);
  expect(new Set(titles).size).toBe(20);

  expect(await updateDb((db) => db.activity.length)).toBe(20);
});
