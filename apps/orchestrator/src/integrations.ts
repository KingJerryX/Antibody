// Decides per integration whether we talk to the real service or a mock, from env alone.

type IntegrationMode = "live" | "mock" | "disabled";
export type IntegrationName = "photon" | "chalk" | "factory" | "github" | "voice";

const has = (...keys: string[]) => keys.every((k) => (process.env[k] ?? "").trim() !== "");

const REQUIRED: Record<IntegrationName, string[]> = {
  photon: ["PHOTON_API_KEY", "PHOTON_PROJECT_ID"],
  chalk: ["CHALK_CLIENT_ID", "CHALK_CLIENT_SECRET"],
  factory: ["FACTORY_API_KEY"],
  github: ["GITHUB_APP_ID", "GITHUB_WEBHOOK_SECRET"],
  // ELEVENLABS_PHONE_NUMBER_ID = the Photon SIP number as imported into ElevenLabs (needed by its outbound-call API).
  voice: ["PHOTON_VOICE_NUMBER", "ELEVENLABS_API_KEY", "ELEVENLABS_AGENT_ID", "ELEVENLABS_PHONE_NUMBER_ID"],
};

export function integrations(): Record<IntegrationName, IntegrationMode> {
  const out = {} as Record<IntegrationName, IntegrationMode>;
  for (const [name, keys] of Object.entries(REQUIRED) as [IntegrationName, string[]][]) {
    // GitHub has no useful mock: without an app there are simply no webhooks.
    // ANTIBODY_MOCK=on forces mocks even when keys are set (safe local testing: no real texts or calls).
    out[name] = process.env.ANTIBODY_MOCK !== "on" && has(...keys) ? "live" : name === "github" ? "disabled" : "mock";
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
    console.log(`  ${name.padEnd(8)} ${mode.toUpperCase().padEnd(8)} ${missing.length ? `missing: ${missing.join(", ")}` : mode === "mock" ? "forced by ANTIBODY_MOCK=on" : ""}`);
  }
  if (process.env.ANTIBODY_MOCK === "off" && Object.values(modes).includes("mock")) {
    console.error("[orchestrator] ANTIBODY_MOCK=off but some integrations have no keys (see table). Exiting.");
    process.exit(1);
  }
}

/** Phone/email handles are personal data: show only the tail in logs and activity. */
export const maskHandle = (h: string) => (h.length <= 4 ? h : `…${h.slice(-4)}`);
