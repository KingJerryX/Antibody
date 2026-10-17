import { expect, test } from "vitest";
import { parseDiff } from "./diff.ts";

test("parses files, hunks and numbered lines", () => {
  const rows = parseDiff(
    ["diff --git a/app.ts b/app.ts", "--- a/app.ts", "+++ b/app.ts", "@@ -10,3 +10,3 @@ fn", " keep", "-old", "+new", " tail", ""].join("\n"),
  );
  expect(rows.map((r) => r.kind)).toEqual(["file", "hunk", "ctx", "del", "add", "ctx"]);
  expect(rows[0].text).toBe("app.ts");
  expect(rows[2]).toMatchObject({ oldNo: 10, newNo: 10 });
  expect(rows[3]).toMatchObject({ text: "old", oldNo: 11 });
  expect(rows[4]).toMatchObject({ text: "new", newNo: 11 });
  expect(rows[5]).toMatchObject({ oldNo: 12, newNo: 12 });
});

test("deleted file falls back to the --- name", () => {
  expect(parseDiff("--- a/gone.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-x")[0]).toEqual({ kind: "file", text: "gone.ts" });
});
