// GitHub App webhook stub: push / pull_request -> "PR check" activity. Disabled unless GITHUB_APP_ID + secret are set.
import { createHmac, timingSafeEqual } from "node:crypto";
import { logActivity } from "@antibody/core";
import { isLive } from "./integrations.ts";

export function verifySignature(body: string, signature: string | undefined, secret: string): boolean {
  if (!signature?.startsWith("sha256=")) return false;
  const want = Buffer.from(`sha256=${createHmac("sha256", secret).update(body).digest("hex")}`);
  const got = Buffer.from(signature);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** Returns an HTTP status. */
export function handleGithubWebhook(body: string, headers: Record<string, string | string[] | undefined>, projectId: string): number {
  if (!isLive("github")) return 404;
  if (!verifySignature(body, headers["x-hub-signature-256"] as string | undefined, process.env.GITHUB_WEBHOOK_SECRET!)) return 401;
  const event = headers["x-github-event"];
  if (event !== "push" && event !== "pull_request") return 204;
  const payload = JSON.parse(body) as { repository?: { full_name?: string }; pull_request?: { number?: number }; after?: string };
  const what = event === "pull_request" ? `PR #${payload.pull_request?.number}` : `push ${String(payload.after ?? "").slice(0, 7)}`;
  // ponytail: stub. Real version: clone the head commit, run the scanner + DroidFixer, post a check run via octokit.
  logActivity({ projectId, type: "scan_started", title: `PR check queued for ${payload.repository?.full_name ?? "repo"} ${what}`, detail: "GitHub check runner is a stub.", channel: "github" });
  return 202;
}
