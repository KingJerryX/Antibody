// Confirms FACTORY_API_KEY + the droid CLI work end to end. Run: npm run droid:check
import { run } from "@factory/droid-sdk/node";

if (!process.env.FACTORY_API_KEY) {
  console.error("FACTORY_API_KEY is empty. Add it to .env.local at the repo root, then rerun.");
  process.exit(1);
}

// Windows: the SDK can't spawn npm's droid.cmd shim, so DROID_EXEC_PATH points at droid.exe.
const result = await run("Reply with exactly the word: ready", { execPath: process.env.DROID_EXEC_PATH || undefined });
if (!result.success) {
  console.error(`Droid run failed: ${result.subtype}`);
  process.exit(1);
}
console.log(`Droid says: ${result.text.trim()}`);
