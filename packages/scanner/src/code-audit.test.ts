import { describe, expect, it } from "vitest";
import type { Finding } from "@antibody/core";
import { mergeFindings, routeFromFile } from "./code-audit.ts";

const finding = (over: Partial<Finding>): Finding => ({
  id: "f",
  projectId: "p",
  kind: "idor",
  severity: "high",
  title: "t",
  plainEnglish: "",
  impact: "",
  evidence: "live proof",
  fixHint: "",
  detectedBy: "url_scan",
  createdAt: "",
  ...over,
});

describe("code audit merge", () => {
  it("maps route files to URL paths", () => {
    expect(routeFromFile("app/api/users/[id]/route.ts")).toBe("/api/users/[id]");
    expect(routeFromFile("src/app/api/chat/route.js")).toBe("/api/chat");
    expect(routeFromFile("app/_components/VibeClient.tsx")).toBeUndefined();
  });

  it("attaches file:line to the live finding it proves and keeps unproven code findings", () => {
    const live = [finding({ id: "live", location: { url: "http://localhost:4000/api/users/1" } })];
    const code = [
      finding({ id: "c1", detectedBy: "code_audit", location: { file: "app/api/users/[id]/route.ts", line: 6 } }),
      finding({ id: "c2", detectedBy: "code_audit", kind: "unprotected_route", location: { file: "app/api/chat/route.ts", line: 6 } }),
    ];
    const merged = mergeFindings(live, code);
    expect(merged.map((f) => f.id)).toEqual(["live", "c2"]);
    expect(merged[0].location).toMatchObject({ url: "http://localhost:4000/api/users/1", file: "app/api/users/[id]/route.ts", line: 6 });
    expect(merged[0].evidence).toContain("Also found in code: app/api/users/[id]/route.ts:6");
    expect(live[0].location?.file).toBeUndefined(); // inputs untouched
  });

  it("does not match a route finding to a different path", () => {
    const live = [finding({ kind: "unprotected_route", location: { url: "http://localhost:4000/api/admin/stats" } })];
    const code = [finding({ id: "c", kind: "unprotected_route", detectedBy: "code_audit", location: { file: "app/api/chat/route.ts", line: 1 } })];
    expect(mergeFindings(live, code)).toHaveLength(2);
  });
});
