import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { ActivityEvent, FixProposal, Project, ProjectMemory, ScanReport } from "./types.ts";

// ponytail: one JSON file shared by web + orchestrator on the same machine.
// Fine for a local demo; move to SQLite/Postgres before multi-process writes or serverless deploys.

export interface Db {
  projects: Project[];
  scans: ScanReport[];
  fixes: FixProposal[];
  activity: ActivityEvent[];
  memory: ProjectMemory[];
}

const empty = (): Db => ({ projects: [], scans: [], fixes: [], activity: [], memory: [] });

/** Repo root = nearest ancestor of cwd whose package.json declares workspaces, so every app shares one data dir.
 *  (Not AGENTS.md: Next 16 writes one into each app folder.) */
function isRoot(dir: string): boolean {
  try {
    return "workspaces" in JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  } catch {
    return false;
  }
}

function repoRoot(): string {
  let dir = process.cwd();
  while (!isRoot(dir)) {
    const parent = dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
  return dir;
}

function dbPath(): string {
  const dir = resolve(repoRoot(), process.env.ANTIBODY_DATA_DIR ?? "data");
  mkdirSync(dir, { recursive: true });
  return join(dir, "db.json");
}

export function readDb(): Db {
  try {
    return { ...empty(), ...JSON.parse(readFileSync(dbPath(), "utf8")) };
  } catch {
    return empty();
  }
}

/** Read-modify-write. The temp-file rename keeps readers from seeing a half-written file. */
export function updateDb<T>(fn: (db: Db) => T): T {
  const db = readDb();
  const result = fn(db);
  const path = dbPath();
  writeFileSync(`${path}.tmp`, JSON.stringify(db, null, 2));
  renameSync(`${path}.tmp`, path);
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
