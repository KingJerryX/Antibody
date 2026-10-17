import { describe, expect, it } from "vitest";
import { allowedFromText, antibodyMayExecute, CALL_AFTER_MS, deliveryFor, inQuietHours } from "./policy.ts";

const quiet = { start: "22:00", end: "07:00", tz: "America/New_York" };
const at = (iso: string) => new Date(iso);
// 03:00 New York (EDT, UTC-4) on 2026-10-17 = 07:00Z; 15:00 NY = 19:00Z.
const night = at("2026-10-17T07:00:00Z");
const day = at("2026-10-17T19:00:00Z");

describe("interrupt budget (§5.3)", () => {
  it("critical active texts now and calls after 5 min, even in quiet hours", () => {
    expect(deliveryFor({ severity: "critical", active: true }, night, quiet)).toEqual({ route: "text_now", callAfterMs: CALL_AFTER_MS });
    expect(CALL_AFTER_MS).toBe(300_000);
  });
  it("critical latent texts now by day but waits out quiet hours", () => {
    expect(deliveryFor({ severity: "critical" }, day, quiet)).toEqual({ route: "text_now" });
    expect(deliveryFor({ severity: "critical" }, night, quiet)).toEqual({ route: "hold_until_quiet_hours_end" });
  });
  it("medium goes to the daily digest, low to the weekly one", () => {
    expect(deliveryFor({ severity: "medium", active: true }, day, quiet).route).toBe("daily_digest");
    expect(deliveryFor({ severity: "low" }, day).route).toBe("weekly_digest");
  });
  it("quiet hours wrap midnight and respect the time zone", () => {
    expect(inQuietHours(night, quiet)).toBe(true);
    expect(inQuietHours(day, quiet)).toBe(false);
    expect(inQuietHours(at("2026-10-18T02:30:00Z"), quiet)).toBe(true); // 22:30 NY
    expect(inQuietHours(night, undefined)).toBe(false);
    expect(inQuietHours(at("2026-10-17T13:00:00Z"), { start: "09:00", end: "17:00", tz: "UTC" })).toBe(true);
  });
});

describe("approval tiers (§5.2)", () => {
  it("text replies may trigger only reversible actions", () => {
    for (const a of ["temporary_block", "rate_limit", "undo", "watch", "approve_fix"] as const) expect(allowedFromText(a).ok).toBe(true);
    for (const a of ["merge_fix", "rotate_key", "delete_data"] as const) expect(allowedFromText(a).ok).toBe(false);
  });
  it("merges are never done from text and never executed by Antibody", () => {
    expect(allowedFromText("merge_fix").why).toMatch(/GitHub/);
    expect(antibodyMayExecute("merge_fix")).toBe(false);
    expect(antibodyMayExecute("delete_data")).toBe(false);
  });
});
