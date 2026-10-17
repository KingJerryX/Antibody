// Shared contract between web, orchestrator, scanner and shield.
// Change it deliberately: every package depends on these shapes.

export type Severity = "critical" | "high" | "medium" | "low";

export type FindingKind =
  | "supabase_rls_disabled"
  | "secret_in_bundle"
  | "unprotected_route"
  | "missing_rate_limit"
  | "unverified_webhook"
  | "idor"
  | "sql_injection"
  | "xss"
  | "missing_security_headers";

export type DetectedBy = "url_scan" | "code_audit" | "pr_check" | "live_shield";

export interface Finding {
  id: string;
  projectId: string;
  kind: FindingKind;
  severity: Severity;
  title: string;
  /** What's wrong, for someone with no security background. */
  plainEnglish: string;
  /** What an attacker could do with it. */
  impact: string;
  /** Proof. Secrets must be redacted (first 4 chars + "…"). */
  evidence: string;
  location?: { url?: string; file?: string; line?: number };
  fixHint: string;
  detectedBy: DetectedBy;
  createdAt: string;
}

export interface ScanReport {
  id: string;
  projectId: string;
  targetUrl: string;
  status: "running" | "done" | "error";
  startedAt: string;
  finishedAt?: string;
  findings: Finding[];
  /** Checks that ran and found nothing, so the report can show "passed". */
  passed: string[];
  error?: string;
}

export type FixCheckName = "exploit_test" | "behavior_tests" | "preview_replay" | "second_review";

export interface FixCheck {
  name: FixCheckName;
  status: "pending" | "pass" | "fail" | "skipped";
  detail: string;
}

export interface FixProposal {
  id: string;
  projectId: string;
  findingId: string;
  status: "drafting" | "ready" | "rejected" | "approved" | "merged" | "rolled_back";
  summary: {
    whatWasWrong: string;
    whatChanges: string;
    whatUsersNotice: string;
  };
  /** Unified diff. */
  diff: string;
  filesChanged: string[];
  linesChanged: number;
  confidence: "high" | "medium" | "low";
  checks: FixCheck[];
  prUrl?: string;
  /** Pull request progress or why there isn't one ("Opening…", "GitHub isn't connected…", an error). */
  prNote?: string;
  previewUrl?: string;
  /** "droid" when the Factory SDK wrote it, "mock" when running without keys. */
  author: "droid" | "mock";
  createdAt: string;
}

export type Channel = "imessage" | "voice" | "email" | "github" | "web";

export type ActivityType =
  | "scan_started"
  | "scan_done"
  | "finding"
  | "fix_drafting"
  | "fix_ready"
  | "message_out"
  | "message_in"
  | "call"
  | "block"
  | "approval"
  | "undo";

export interface ActivityEvent {
  id: string;
  projectId: string;
  at: string;
  type: ActivityType;
  title: string;
  detail?: string;
  channel?: Channel;
  /** Id of the related finding, fix, or scan. */
  refId?: string;
}

export interface ShieldDecision {
  action: "allow" | "block" | "challenge";
  /** 0 (benign) to 1 (certain attack). */
  riskScore: number;
  reasons: string[];
  /** fail_open = no engine could decide, request allowed. If Chalk is unreachable the local engine decides ("local"). */
  source: "chalk" | "local" | "fail_open";
}

export type Autonomy = "always_ask" | "auto_low_risk" | "notify_only";

export interface Teammate {
  name: string;
  /** E.164 phone or iMessage email. */
  handle: string;
  role: "owner" | "teammate";
}

/** One memory per project, shared across channels and teammates. */
export interface ProjectMemory {
  projectId: string;
  teammates: Teammate[];
  preferences: {
    autonomy: Autonomy;
    quietHours?: { start: string; end: string; tz: string };
    /** Routes Antibody must never auto-block, e.g. "/api/checkout". */
    neverAutoBlock: string[];
  };
  decisions: { at: string; by: string; text: string }[];
  /** Summaries of incidents and voice calls, newest last. */
  notes: { at: string; channel: Channel; text: string }[];
  /** Pairing code shown only on the project's Live page; texting "START <code>" links a phone to the project. */
  startCode?: string;
  /** Phones registered with Photon from the setup page, and the Antibody line each one should text. */
  phoneLines?: { handle: string; line: string }[];
}

export interface Project {
  id: string;
  name: string;
  url: string;
  /** GitHub "owner/name" the project's code lives in, once connected. */
  repo?: string;
  /** The Antibody GitHub App installation that grants access to `repo`. */
  githubInstallationId?: number;
  /** Only verified projects may be actively probed. */
  verifiedDomain: boolean;
  createdAt: string;
}
