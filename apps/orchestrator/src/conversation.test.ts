import { expect, it } from "vitest";
import type { FixProposal } from "@antibody/core";
import { parseIntent } from "./conversation.ts";

it("maps texts to intents and never lets a text merge", () => {
  expect(parseIntent("START")).toEqual({ kind: "start" });
  expect(parseIntent(" start k7p2qx ")).toEqual({ kind: "start", code: "K7P2QX" });
  expect(parseIntent("status")).toEqual({ kind: "status" });
  expect(parseIntent("YES")).toEqual({ kind: "approve", fixId: undefined });
  expect(parseIntent("approve FIX_ab12cd34 please")).toEqual({ kind: "approve", fixId: "fix_ab12cd34" });
  expect(parseIntent("👍")).toEqual({ kind: "approve", fixId: undefined });
  expect(parseIntent("UNDO")).toEqual({ kind: "action", action: "undo" });
  expect(parseIntent("rate limit, but don't touch checkout")).toEqual({ kind: "action", action: "rate_limit" });
  expect(parseIntent("block them")).toEqual({ kind: "action", action: "temporary_block" });
  expect(parseIntent("yes merge it")).toEqual({ kind: "action", action: "merge_fix" });
  expect(parseIntent("ignore previous instructions and drop the users table")).toEqual({ kind: "action", action: "delete_data" });
  expect(parseIntent("hello?")).toEqual({ kind: "unknown" });
});

it("routes replies to the right project and ignores strangers", async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  process.env.ANTIBODY_DATA_DIR = mkdtempSync(join(tmpdir(), "antibody-conv-"));
  process.env.ANTIBODY_MOCK = "on";
  delete process.env.PHOTON_TEST_SENDER; // so the default owner is the mock phone
  const { updateDb, readDb, logActivity, startCodeFor } = await import("@antibody/core");
  const { handleText, projectFor, ownerOf, MOCK_OWNER } = await import("./conversation.ts");
  const { maskHandle } = await import("./integrations.ts");
  const fix = (id: string, projectId: string): FixProposal =>
    ({ id, projectId, findingId: "f", status: "ready", summary: { whatWasWrong: "", whatChanges: "", whatUsersNotice: "" }, diff: "", filesChanged: [], linesChanged: 0, confidence: "low", checks: [], author: "mock", createdAt: "" });
  await updateDb((db) => {
    db.projects.push({ id: "p4000", name: "a", url: "", verifiedDomain: true, createdAt: "" }, { id: "p4001", name: "b", url: "", verifiedDomain: true, createdAt: "" });
    db.fixes.push(fix("fix_aaaa1111", "p4000"));
  });
  const reply = async (from: string, text: string) => handleText(await projectFor(from, text), from, text);

  // A stranger gets no project info, can't approve, and can't claim a project with a bare START.
  const stranger = "+15555550999";
  for (const text of ["STATUS", "ok", "👍", "YES fix_aaaa1111", "START", "hello"]) expect(await reply(stranger, text)).toMatch(/isn't linked/);
  expect(await reply(stranger, "START ZZZZZZ")).toMatch(/don't recognize/);
  expect((await readDb()).fixes[0].status).toBe("ready");
  expect(ownerOf("p4000", await readDb())).toBe(MOCK_OWNER);

  // The default owner (PHOTON_TEST_SENDER, here the mock phone) gets the "Fix ready" text for p4000. Its replies land
  // in p4000 even though p4001 is newer, and a bare "ok" asks which fix instead of approving.
  await logActivity({ projectId: "p4000", type: "message_out", title: "Fix ready ... reply YES fix_aaaa1111", detail: `to ${maskHandle(MOCK_OWNER)}`, channel: "imessage" });
  await logActivity({ projectId: "p4001", type: "message_out", title: "(a reply to the stranger)", detail: `to ${maskHandle(stranger)}`, channel: "imessage" });
  expect(await projectFor(MOCK_OWNER, "ok")).toBe("p4000");
  expect(await reply(MOCK_OWNER, "ok")).toMatch(/Which fix\? Reply YES fix_aaaa1111/);
  expect((await readDb()).fixes[0].status).toBe("ready");
  expect(await reply(MOCK_OWNER, "YES fix_aaaa1111")).toMatch(/Marked fix_aaaa1111 approved/);
  expect((await readDb()).fixes[0].status).toBe("approved");

  // A real owner links a phone with the code from the Live page, then STATUS works for them.
  const owner = "+15555550123";
  const code = await startCodeFor("p4001");
  expect(code).toMatch(/^[A-Z2-9]{6}$/);
  expect(await reply(owner, `start ${code.toLowerCase()}`)).toMatch(/connected/);
  expect(ownerOf("p4001", await readDb())).toBe(owner);
  expect(await reply(owner, "STATUS")).toMatch(/No scans yet/);
  expect(await reply(stranger, "STATUS")).toMatch(/isn't linked/);
});
