import { describe, expect, it } from "vitest";
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

  it("computes nearest-rank p95", () => {
    expect(percentile(Array.from({ length: 100 }, (_, i) => i + 1), 95)).toBe(95);
    expect(percentile([], 95)).toBe(0);
  });
});
