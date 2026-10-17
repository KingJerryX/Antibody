// Cross-platform launcher for the shielded copy: next dev on port 4001 with SHIELD=on.
// No cross-env dependency — we set the env here and spawn next ourselves.
import { spawn } from "node:child_process";

const port = process.env.PORT || "4001";
const child = spawn("next", ["dev", "-H", "127.0.0.1", "-p", port], {
  stdio: "inherit",
  shell: true, // needed on Windows to resolve next.cmd
  env: { ...process.env, SHIELD: "on" },
});

child.on("exit", (code) => process.exit(code ?? 0));
