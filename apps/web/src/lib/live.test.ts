import type { ActivityEvent } from "@antibody/core";
import { expect, test } from "vitest";
import { fixesAwaitingReview, integrationSummary, latestScanId } from "./live.ts";

const ev = (type: ActivityEvent["type"], refId?: string): ActivityEvent => ({ id: Math.random().toString(), projectId: "p", at: "", type, title: "", refId });

test("only fixes whose last word is fix_ready await review", () => {
  const events = [
    ev("fix_ready", "fix_a"),
    ev("fix_ready", "fix_b"),
    ev("approval", "fix_b"),
    ev("fix_ready", "fix_c"),
    ev("fix_drafting", "fix_c"), // owner asked for a revision
    ev("message_out", "fix_a"), // texts about a fix don't change its state
  ];
  expect(fixesAwaitingReview(events)).toBe(1);
});

test("latest scan is the newest scan_done", () => {
  expect(latestScanId([ev("scan_done", "scan_1"), ev("finding", "f"), ev("scan_done", "scan_2"), ev("block")])).toBe("scan_2");
  expect(latestScanId([ev("scan_started", "scan_3")])).toBeUndefined();
});

test("integration summary groups services by mode", () => {
  expect(integrationSummary({ photon: "mock", chalk: "mock", factory: "live", github: "disabled", voice: "mock" })).toBe(
    "Droid live · iMessage, Chalk and calls mocked · GitHub off",
  );
  expect(integrationSummary({ factory: "live" })).toBe("Droid live");
});
