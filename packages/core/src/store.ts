import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { ActivityEvent, FixProposal, Project, ProjectMemory, ScanReport } from "./types.ts";

// ponytail: one JSON file shared by web + orchestrator on the same machine.
// On Vercel the bundle is read-only, so this process keeps the file in /tmp and in memory.
// Another instance cannot see that copy; the scan response carries the report for the browser.

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

function load(): Db {
  const cached = process.env.VERCEL ? mem().__antibodyDb : undefined;
  if (cached) return cached;
  try {
    return { ...empty(), ...JSON.parse(readFileSync(dbPath(), "utf8")) };
  } catch {
    return empty();
  }
}

export function readDb(): Db {
  const db = load();
  return process.env.VERCEL && mem().__antibodyDb ? structuredClone(db) : db;
}

/** Read-modify-write. The temp-file rename keeps readers from seeing a half-written file. */
export function updateDb<T>(fn: (db: Db) => T): T {
  const db = load();
  const result = fn(db);
  if (process.env.VERCEL) mem().__antibodyDb = db;
  const path = dbPath();
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(`${path}.tmp`, JSON.stringify(db, null, 2));
    renameSync(`${path}.tmp`, path);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    // The deployed app's filesystem is read-only outside /tmp. Keep the in-memory copy.
    if (process.env.VERCEL && (code === "EROFS" || code === "EPERM" || code === "EACCES")) return result;
    throw err;
  }
  return result;
}

export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;

export function logActivity(e: Omit<ActivityEvent, "id" | "at">): ActivityEvent {
  const event = { ...e, id: newId("evt"), at: new Date().toISOString() };
  updateDb((db) => db.activity.push(event));
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
export function startCodeFor(projectId: string): string {
  const existing = readDb().memory.find((m) => m.projectId === projectId)?.startCode;
  if (existing) return existing;
  return updateDb((db) => {
    const m = memoryFor(db, projectId);
    m.startCode ??= Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
    return m.startCode;
  });
}
