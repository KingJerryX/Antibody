// Starts the whole demo: sample app (4000), shielded sample app (4001), orchestrator (3001), web (3000).
// Cross-platform, no deps. Ctrl+C stops everything (whole process trees on Windows).
import { spawn, execSync } from "node:child_process";

const services = [
  ["sample", "npm run dev -w @antibody/vuln-app"],
  ["shielded", "npm run dev:protected -w @antibody/vuln-app"],
  ["orch", "npm run dev -w @antibody/orchestrator"],
  ["web", "npm run dev -w @antibody/web"],
];

const children = services.map(([name, cmd]) => {
  const child = spawn(cmd, { shell: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
  const tag = `[${name}]`.padEnd(11);
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (buf) => {
      for (const line of buf.toString().split(/\r?\n/)) if (line.trim()) console.log(tag, line);
    });
  }
  child.on("exit", (code) => console.log(tag, `exited (${code})`));
  return child;
});

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const c of children) {
    if (c.exitCode !== null) continue;
    try {
      if (process.platform === "win32") execSync(`taskkill /pid ${c.pid} /T /F`, { stdio: "ignore" });
      else process.kill(-c.pid, "SIGTERM");
    } catch {
      c.kill();
    }
  }
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

console.log("Antibody dev: web http://localhost:3000 · orchestrator :3001 · sample :4000 · shielded :4001 (Ctrl+C stops all)");
