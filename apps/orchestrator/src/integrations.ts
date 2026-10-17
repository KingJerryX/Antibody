// Decides per integration whether we talk to the real service or a mock: env keys, plus the GitHub App file.
import { timingSafeEqual } from "node:crypto";
import { githubAppOnDisk } from "@antibody/core";

type IntegrationMode = "live" | "mock" | "disabled";
export type IntegrationName = "photon" | "chalk" | "factory" | "github" | "voice";

const has = (...keys: string[]) => keys.every((k) => (process.env[k] ?? "").trim() !== "");

const REQUIRED: Record<IntegrationName, string[]> = {
  photon: ["PHOTON_API_KEY", "PHOTON_PROJECT_ID"],
  chalk: ["CHALK_CLIENT_ID", "CHALK_CLIENT_SECRET"],
  factory: ["FACTORY_API_KEY"],
  // Created from Connect GitHub. Local file, or the Supabase "github-app" row on Vercel.
  github: [],
  // ELEVENLABS_PHONE_NUMBER_ID = the Photon SIP number as imported into ElevenLabs (needed by its outbound-call API).
  voice: ["PHOTON_VOICE_NUMBER", "ELEVENLABS_API_KEY", "ELEVENLABS_AGENT_ID", "ELEVENLABS_PHONE_NUMBER_ID"],
};

export function integrations(): Record<IntegrationName, IntegrationMode> {
  const out = {} as Record<IntegrationName, IntegrationMode>;
  for (const [name, keys] of Object.entries(REQUIRED) as [IntegrationName, string[]][]) {
    // GitHub has no useful mock: without an app there are simply no webhooks.
    // ANTIBODY_MOCK=on forces mocks even when keys are set (safe local testing: no real texts or calls).
    const ready = name === "github" ? githubAppOnDisk() : has(...keys);
    out[name] = process.env.ANTIBODY_MOCK !== "on" && ready ? "live" : name === "github" ? "disabled" : "mock";
  }
  return out;
}

export const isLive = (name: IntegrationName) => integrations()[name] === "live";

/** Startup table. Prints key NAMES that are missing, never values. Exits when ANTIBODY_MOCK=off and anything is mocked. */
export function logIntegrations(): void {
  const modes = integrations();
  console.log("[orchestrator] integrations:");
  for (const [name, mode] of Object.entries(modes) as [IntegrationName, IntegrationMode][]) {
    const missing = REQUIRED[name].filter((k) => !has(k));
    console.log(`  ${name.padEnd(8)} ${mode.toUpperCase().padEnd(8)} ${missing.length ? `missing: ${missing.join(", ")}` : name === "github" && mode === "disabled" ? "connect GitHub on a project's setup page" : mode === "mock" ? "forced by ANTIBODY_MOCK=on" : ""}`);
  }
  if (process.env.ANTIBODY_MOCK === "off" && Object.values(modes).includes("mock")) {
    console.error("[orchestrator] ANTIBODY_MOCK=off but some integrations have no keys (see table). Exiting.");
    process.exit(1);
  }
}

/** "Bearer <token>" check in constant time, so the response time doesn't leak how much of a guess was right. */
export function bearerMatches(header: string | undefined, token: string): boolean {
  const got = Buffer.from(header ?? "");
  const want = Buffer.from(`Bearer ${token}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Phone/email handles are personal data: show only the tail in logs and activity. */
export const maskHandle = (h: string) => (h.length <= 4 ? h : `…${h.slice(-4)}`);

/** "(617) 555-0123" -> "+16175550123". Ten digits are read as a US number; anything else needs a leading +. */
export function toE164(raw?: string): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/[^\d+]/g, "");
  const e164 = digits.startsWith("+") ? digits : digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith("1") ? `+${digits}` : "";
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : undefined;
}
