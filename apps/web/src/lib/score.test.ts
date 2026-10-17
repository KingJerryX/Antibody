import { expect, test } from "vitest";
import { securityScore } from "./score.ts";

test("a single low finding with live checks skipped is not a 97", () => {
  const skipped = ["Live checks did not run. They call this site's API with no login."];
  expect(securityScore([{ severity: "low" }], skipped)).toBe(82);
  expect(securityScore([], skipped)).toBe(85);
});

test("a verified scan keeps the full scale", () => {
  expect(securityScore([{ severity: "low" }], [])).toBe(97);
  expect(securityScore([{ severity: "critical" }, { severity: "high" }])).toBe(45);
});
