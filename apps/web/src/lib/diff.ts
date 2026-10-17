export type DiffRow =
  | { kind: "file"; text: string }
  | { kind: "hunk"; text: string }
  | { kind: "add" | "del" | "ctx"; text: string; oldNo?: number; newNo?: number };

/** Tiny unified-diff parser: file headers, hunks, and +/-/context lines with line numbers. */
export function parseDiff(diff: string): DiffRow[] {
  const rows: DiffRow[] = [];
  let oldNo = 0;
  let newNo = 0;
  let minusFile = "";
  const lines = diff.replace(/\r\n/g, "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  for (const line of lines) {
    if (line.startsWith("diff --git") || line.startsWith("index ") || line.startsWith("\\")) continue;
    if (line.startsWith("--- ")) {
      minusFile = line.slice(4).replace(/^a\//, "");
      continue;
    }
    if (line.startsWith("+++ ")) {
      const plus = line.slice(4).replace(/^b\//, "");
      rows.push({ kind: "file", text: plus === "/dev/null" ? minusFile : plus });
      continue;
    }
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(line);
    if (hunk) {
      oldNo = Number(hunk[1]);
      newNo = Number(hunk[2]);
      rows.push({ kind: "hunk", text: line });
    } else if (line.startsWith("+")) {
      rows.push({ kind: "add", text: line.slice(1), newNo: newNo++ });
    } else if (line.startsWith("-")) {
      rows.push({ kind: "del", text: line.slice(1), oldNo: oldNo++ });
    } else {
      rows.push({ kind: "ctx", text: line.slice(1), oldNo: oldNo++, newNo: newNo++ });
    }
  }
  return rows;
}
