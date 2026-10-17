import { describe, expect, it } from "vitest";
import { toE164 } from "./integrations.ts";

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
