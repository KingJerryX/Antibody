import { describe, expect, it } from "vitest";
import { proposeFix, replayOwnProfile } from "./fix-proof.ts";
import { percentile, scoreScan, scoreShield } from "./metrics.ts";

describe("eval metrics", () => {
  it("scores scanner coverage and false alarms", () => {
    expect(scoreScan(["idor", "secret_in_bundle", "unprotected_route"], ["idor", "idor", "xss"])).toEqual({
      seeded: 3,
      found: 1,
      falseAlarms: 1,
    });
  });

  it("scores shield runs", () => {
    const r = scoreShield([[200, 200, 200, 200, 403], [200, 429], [200, 200]], [200, 200, 403, 200], [5, 10, 20, 100]);
    expect(r).toEqual({ attacks: 3, blocked: 2, normal: 4, wronglyBlocked: 1, requestsBeforeBlock: 3, p95Ms: 100 });
  });

  it("turns a Chalk profile block into an ownership fix that refuses the other user", () => {
    expect(replayOwnProfile()).toBe(true);
    expect(proposeFix({ path: "/api/users/7", decision: "block", riskScore: 1, reasons: ["this session read 7 different users' profiles"], distinctUsers: 7 })).toBe("own-profile");
    expect(proposeFix({ path: "/api/chat", decision: "block", riskScore: 1, reasons: ["too many AI chat calls"], distinctUsers: 0 })).toBe("none");
  });

  it("computes nearest-rank p95", () => {
    expect(percentile(Array.from({ length: 100 }, (_, i) => i + 1), 95)).toBe(95);
    expect(percentile([], 95)).toBe(0);
  });
});
