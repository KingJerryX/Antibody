import { describe, expect, it } from "vitest";
import { bearerMatches, toE164 } from "./integrations.ts";

it("accepts only the exact orchestrator token", () => {
  expect(bearerMatches("Bearer s3cret", "s3cret")).toBe(true);
  expect(bearerMatches("Bearer s3cre", "s3cret")).toBe(false);
  expect(bearerMatches("s3cret", "s3cret")).toBe(false);
  expect(bearerMatches(undefined, "s3cret")).toBe(false);
});

describe("toE164", () => {
  it("normalizes what people type", () => {
    expect(toE164("(617) 555-0123")).toBe("+16175550123");
    expect(toE164("1 617 555 0123")).toBe("+16175550123");
    expect(toE164("+44 20 7946 0958")).toBe("+442079460958");
  });
  it("rejects what isn't a phone number", () => {
    expect(toE164("555-0123")).toBeUndefined();
    expect(toE164("me@example.com")).toBeUndefined();
    expect(toE164(undefined)).toBeUndefined();
  });
});
