import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { ActivityEvent, FixProposal, Project, ProjectMemory, ScanReport } from "./types.ts";

// Two backends, same document:
// - Supabase, when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set: one jsonb row, so the site on Vercel and the
//   orchestrator elsewhere share state. Writes are compare-and-swap on `version`, retried on conflict.
// - Otherwise a JSON file: data/db.json shared by web + orchestrator on one machine (local dev, empty .env.local).
//   On Vercel without Supabase the bundle is read-only, so each instance keeps its own copy in /tmp and in memory;
//   another instance can't see it, so the scan response carries the report for the browser.
// ponytail: the whole store is one row rewritten per write; split into tables if activity grows past a few MB.
// The GitHub App private key is a second row, id "github-app", so it is not copied into every project read.
//
// Supabase setup (SQL editor, once). RLS on with no policies = only the service role key can touch it:
//   create table antibody_store (id text primary key, data jsonb not null, version int not null);
//   alter table antibody_store enable row level security;

export interface Db {
  projects: Project[];
  scans: ScanReport[];
  fixes: FixProposal[];
  activity: ActivityEvent[];
  memory: ProjectMemory[];
}

const empty = (): Db => ({ projects: [], scans: [], fixes: [], activity: [], memory: [] });

/** Repo root = nearest ancestor of cwd whose package.json declares workspaces, so every app shares one data dir.
 *  (Not AGENTS.md: Next 16 writes one into each app folder.) Found once per process. */
let root: string | undefined;
export function repoRoot(): string {
  if (root) return root;
  for (let dir = process.cwd(); ; ) {
    try {
      if ("workspaces" in JSON.parse(readFileSync(join(dir, "package.json"), "utf8"))) return (root = dir);
    } catch {
      /* no package.json here */
    }
    const parent = dirname(dir);
    if (parent === dir) return (root = process.cwd());
    dir = parent;
  }
}

type Mem = { __antibodyDb?: Db };
const mem = () => globalThis as Mem;

// ANTIBODY_DATA_DIR is read on every call: tests set it after this module has loaded.
// Vercel can only write /tmp, and that directory belongs to one instance.
const dbPath = () =>
  process.env.VERCEL ? "/tmp/antibody-db.json" : join(resolve(repoRoot(), process.env.ANTIBODY_DATA_DIR ?? "data"), "db.json");

function readFileDb(): Db {
  const cached = process.env.VERCEL ? mem().__antibodyDb : undefined;
  if (cached) return structuredClone(cached);
  try {
    return { ...empty(), ...JSON.parse(readFileSync(dbPath(), "utf8")) };
  } catch {
    return empty();
  }
}

/** The temp-file rename keeps readers from seeing a half-written file. */
function writeFileDb(db: Db): void {
  if (process.env.VERCEL) mem().__antibodyDb = db;
  const path = dbPath();
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(`${path}.tmp`, JSON.stringify(db, null, 2));
    renameSync(`${path}.tmp`, path);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    // The deployed app's filesystem is read-only outside /tmp. Keep the in-memory copy.
    if (process.env.VERCEL && (code === "EROFS" || code === "EPERM" || code === "EACCES")) return;
    throw err;
  }
}

// Read per call: env is only complete at request time on Vercel, and tests set it after import.
function supabase() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && key ? { url: url.replace(/\/$/, ""), key } : undefined;
}

/** PostgREST call on the antibody_store table. Never logs the key. */
async function rest<T>(query: string, init: { method?: string; prefer?: string; body?: unknown } = {}): Promise<T> {
  const { url, key } = supabase()!;
  const res = await fetch(`${url}/rest/v1/antibody_store?${query}`, {
    method: init.method ?? "GET",
    // New sb_secret_ keys go in apikey only; legacy service_role JWTs (eyJ…) also need the Bearer header.
    headers: { apikey: key, ...(key.startsWith("eyJ") && { authorization: `Bearer ${key}` }), "content-type": "application/json", ...(init.prefer && { prefer: init.prefer }) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Supabase store ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

export const hasRemoteStore = () => Boolean(supabase());

/** A non-document row in antibody_store, such as the GitHub App key. `id` is a fixed name, never user input. */
export async function readNamedRow<T>(id: string): Promise<T | undefined> {
  const rows = await rest<{ data: T }[]>(`id=eq.${id}&select=data`);
  return rows[0]?.data;
}

export async function writeNamedRow(id: string, data: unknown): Promise<void> {
  const existing = await rest<{ id: string }[]>(`id=eq.${id}&select=id`);
  if (existing.length) {
    const updated = await rest<unknown[]>(`id=eq.${id}`, { method: "PATCH", prefer: "return=representation", body: { data } });
    if (!updated.length) throw new Error(`Supabase store: could not save ${id}`);
    return;
  }
  const inserted = await rest<unknown[]>("on_conflict=id", {
    method: "POST",
    prefer: "return=representation,resolution=merge-duplicates",
    body: { id, data, version: 1 },
  });
  if (!inserted.length) throw new Error(`Supabase store: could not save ${id}`);
}

type Row = { data: Db; version: number };
const readRow = async () => (await rest<Row[]>("id=eq.main&select=data,version"))[0];

export async function readDb(): Promise<Db> {
  if (!supabase()) return readFileDb();
  const row = await readRow();
  return { ...empty(), ...row?.data };
}

/**
 * Read-modify-write. `fn` may run more than once (Supabase retries on a concurrent write), so it must only
 * change `db`. File mode: the temp-file rename keeps readers from seeing a half-written file.
 */
export async function updateDb<T>(fn: (db: Db) => T): Promise<T> {
  if (!supabase()) {
    const db = readFileDb();
    const result = fn(db);
    writeFileDb(db);
    return result;
  }
  for (let attempt = 0; attempt < 10; attempt++) {
    const row = await readRow();
    const db = { ...empty(), ...row?.data };
    const result = fn(db);
    // Only lands if nobody wrote since our read; an empty result means we lost the race, so re-read and retry.
    const written = row
      ? await rest<Row[]>(`id=eq.main&version=eq.${row.version}`, { method: "PATCH", prefer: "return=representation", body: { data: db, version: row.version + 1 } })
      : await rest<Row[]>("on_conflict=id", { method: "POST", prefer: "return=representation,resolution=ignore-duplicates", body: { id: "main", data: db, version: 1 } });
    if (written.length) return result;
    await new Promise((r) => setTimeout(r, 20 + Math.random() * 80 * (attempt + 1)));
  }
  throw new Error("Supabase store: too many concurrent writes, gave up");
}

export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;

export async function logActivity(e: Omit<ActivityEvent, "id" | "at">): Promise<ActivityEvent> {
  const event = { ...e, id: newId("evt"), at: new Date().toISOString() };
  await updateDb((db) => db.activity.push(event));
  return event;
}

/** The project's memory row, created with safe defaults (always ask, no teammates) if missing. Mutates `db`. */
export function memoryFor(db: Db, projectId: string): ProjectMemory {
  let m = db.memory.find((x) => x.projectId === projectId);
  if (!m) {
    m = { projectId, teammates: [], preferences: { autonomy: "always_ask", neverAutoBlock: [] }, decisions: [], notes: [] };
    db.memory.push(m);
  }
  return m;
}

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L

/** The project's START code, created on first use. Show it only where the owner is (the localhost web UI). */
export async function startCodeFor(projectId: string): Promise<string> {
  const existing = (await readDb()).memory.find((m) => m.projectId === projectId)?.startCode;
  if (existing) return existing;
  return updateDb((db) => {
    const m = memoryFor(db, projectId);
    m.startCode ??= Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
    return m.startCode;
  });
}
