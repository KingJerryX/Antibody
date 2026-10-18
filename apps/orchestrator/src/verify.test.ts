import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { placeholderEnv } from "./verify.ts";

it("fills .env.example so the patched copy boots without the owner's secrets or database", () => {
  const dir = mkdtempSync(join(tmpdir(), "env-"));
  writeFileSync(join(dir, ".env.example"), 'DATABASE_URL="postgresql://u:<password>@db.example.com:6543/postgres"\nSESSION_SECRET=""\nAPP_TIMEZONE="America/New_York"\nSITE="https://x.com"\n');
  expect(placeholderEnv(dir)).toEqual({
    DATABASE_URL: "postgresql://antibody:antibody@127.0.0.1:1/antibody",
    SESSION_SECRET: "antibody-placeholder-0000000000000000",
    APP_TIMEZONE: "America/New_York",
    SITE: "https://x.com",
  });
  expect(placeholderEnv(mkdtempSync(join(tmpdir(), "env-")))).toEqual({});
});
