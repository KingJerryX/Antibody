import { draftMockFix, logActivity, newId, readDb, updateDb, type Finding, type FindingKind, type FixProposal, type Severity } from "@antibody/core";

const KINDS = new Set<FindingKind>([
  "supabase_rls_disabled",
  "secret_in_bundle",
  "unprotected_route",
  "missing_rate_limit",
  "unverified_webhook",
  "idor",
  "sql_injection",
  "xss",
  "missing_security_headers",
  "dnssec_disabled",
  "dmarc_missing",
  "bug",
  "data_leak",
  "optimization",
]);
const SEVERITIES = new Set<Severity>(["critical", "high", "medium", "low"]);

/** The browser sends the finding it already rendered. Production has no shared store with the orchestrator. */
export function asFinding(v: unknown): Finding | undefined {
  if (!v || typeof v !== "object") return;
  const f = v as Partial<Finding>;
  if (typeof f.id !== "string" || typeof f.projectId !== "string" || typeof f.kind !== "string" || !KINDS.has(f.kind as FindingKind)) return;
  if (typeof f.title !== "string" || typeof f.plainEnglish !== "string") return;
  const severity = SEVERITIES.has(f.severity as Severity) ? (f.severity as Severity) : "low";
  return {
    id: f.id.slice(0, 80),
    projectId: f.projectId.slice(0, 80),
    kind: f.kind as FindingKind,
    severity,
    title: f.title.slice(0, 300),
    plainEnglish: f.plainEnglish.slice(0, 2000),
    impact: typeof f.impact === "string" ? f.impact.slice(0, 2000) : "",
    evidence: typeof f.evidence === "string" ? f.evidence.slice(0, 2000) : "",
    fixHint: typeof f.fixHint === "string" ? f.fixHint.slice(0, 2000) : "",
    detectedBy: f.detectedBy === "code_audit" || f.detectedBy === "pr_check" || f.detectedBy === "live_shield" ? f.detectedBy : "url_scan",
    createdAt: typeof f.createdAt === "string" ? f.createdAt.slice(0, 40) : new Date().toISOString(),
    location:
      f.location && typeof f.location === "object"
        ? {
            url: typeof f.location.url === "string" ? f.location.url.slice(0, 2000) : undefined,
            file: typeof f.location.file === "string" ? f.location.file.slice(0, 300) : undefined,
            line: typeof f.location.line === "number" ? f.location.line : undefined,
          }
        : undefined,
  };
}

/** Mock patch for a finding. One ready fix per finding, so a second click reopens the same review. */
export async function proposeFix(finding: Finding): Promise<FixProposal> {
  const existing = (await readDb()).fixes.find((f) => f.findingId === finding.id && (f.status === "ready" || f.status === "drafting" || f.status === "approved"));
  if (existing) return existing;
  const fix: FixProposal = {
    id: newId("fix"),
    projectId: finding.projectId,
    findingId: finding.id,
    status: "ready",
    ...draftMockFix(finding),
    createdAt: new Date().toISOString(),
  };
  await updateDb((db) => {
    db.fixes.push(fix);
  });
  await logActivity({
    projectId: finding.projectId,
    type: "fix_ready",
    title: `Fix ready: ${finding.title}`,
    detail: `${fix.linesChanged} lines, confidence ${fix.confidence} [mock fixer]`,
    channel: "web",
    refId: fix.id,
  });
  return fix;
}

function asFix(v: unknown, id: string): FixProposal | undefined {
  if (!v || typeof v !== "object") return;
  const f = v as FixProposal;
  if (f.id !== id || typeof f.projectId !== "string" || typeof f.findingId !== "string") return;
  if (f.author !== "mock" && f.author !== "droid") return;
  if (!f.summary || typeof f.summary.whatWasWrong !== "string" || typeof f.diff !== "string" || f.diff.length > 100_000) return;
  return f;
}

export async function actOnFix(
  id: string,
  action: "approve" | "reject" | "revise",
  instructions: string | undefined,
  posted: unknown,
): Promise<{ fix: FixProposal } | { error: string; status: number }> {
  let fix = (await readDb()).fixes.find((f) => f.id === id);
  if (!fix) {
    const fromClient = asFix(posted, id);
    if (!fromClient) return { error: `fix ${id} not found`, status: 404 };
    await updateDb((db) => {
      if (!db.fixes.some((f) => f.id === id)) db.fixes.push(fromClient);
    });
    fix = fromClient;
  }

  let next: FixProposal;
  if (action === "approve") {
    if (fix.status !== "ready") return { error: `fix is ${fix.status}, only ready fixes can be approved`, status: 409 };
    next = { ...fix, status: "approved" };
    await logActivity({ projectId: fix.projectId, type: "approval", title: `Fix ${id} approved on the review page`, detail: "GitHub is not connected, so no pull request was opened.", channel: "web", refId: id });
  } else if (action === "reject") {
    if (fix.status !== "ready" && fix.status !== "drafting") return { error: `fix is ${fix.status}`, status: 409 };
    next = { ...fix, status: "rejected" };
    await logActivity({ projectId: fix.projectId, type: "approval", title: `Fix ${id} rejected`, channel: "web", refId: id });
  } else {
    if (fix.status !== "ready" && fix.status !== "rejected") return { error: `fix is ${fix.status}`, status: 409 };
    const note = instructions?.trim().slice(0, 200);
    if (!note) return { error: "Tell Antibody what to change", status: 400 };
    next = { ...fix, status: "ready", summary: { ...fix.summary, whatChanges: `${fix.summary.whatChanges} (Revised per your note: "${note}".)` } };
    await logActivity({ projectId: fix.projectId, type: "fix_drafting", title: `Revising fix ${id}`, detail: note, channel: "web", refId: id });
  }

  await updateDb((db) => {
    const i = db.fixes.findIndex((f) => f.id === id);
    if (i >= 0) db.fixes[i] = next;
    else db.fixes.push(next);
  });
  return { fix: next };
}
