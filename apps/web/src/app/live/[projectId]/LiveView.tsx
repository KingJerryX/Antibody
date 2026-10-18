"use client";

import type { ActivityEvent, ActivityType, ScanReport } from "@antibody/core";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BlockedBanner } from "@/components/BlockedBanner";
import { ACTIVITY_LABEL, Icon, Logo, timeAgo } from "@/components/ui";
import { useHealth } from "@/components/useHealth";
import { usePoll } from "@/components/usePoll";
import { fixesAwaitingReview, integrationSummary, latestScanId } from "@/lib/live";

const BANNER_MS = 8000;

/** Feed color by what the event means for the owner, not by which system logged it. */
const FEED_TONE: Partial<Record<ActivityType, "bad" | "warn" | "good" | "info">> = {
  block: "bad",
  finding: "warn",
  fix_ready: "good",
  approval: "good",
  scan_done: "good",
  message_out: "info",
  message_in: "info",
  call: "info",
};

export function LiveView({ startCode }: { startCode?: string }) {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: events = [], error } = usePoll<ActivityEvent[]>(`/api/activity?projectId=${encodeURIComponent(projectId)}`, 2000);
  const scanId = latestScanId(events);
  const { data: scan } = usePoll<ScanReport>(scanId ? `/api/scan/${scanId}` : null, 0, () => false);
  const health = useHealth();
  const [banner, setBanner] = useState<ActivityEvent | null>(null);
  const seen = useRef<Set<string> | null>(null);

  // Banner on any block that arrives while the page is open (or one from the last few seconds on load).
  useEffect(() => {
    if (!events.length && !seen.current) return;
    const isFirst = !seen.current;
    const prev = seen.current ?? new Set<string>();
    const fresh = events.filter((e) => e.type === "block" && !prev.has(e.id) && (!isFirst || Date.now() - Date.parse(e.at) < BANNER_MS));
    seen.current = new Set(events.map((e) => e.id));
    if (fresh.length) setBanner(fresh.at(-1)!);
  }, [events]);

  const count = (...types: ActivityType[]) => events.filter((e) => types.includes(e.type)).length;
  const thread = events.filter((e) => e.type === "message_in" || e.type === "message_out" || e.type === "call");
  const host = scan ? (URL.parse(scan.targetUrl)?.host ?? scan.targetUrl) : projectId;

  return (
    <div className="ab">
      <div className="wrap page view">
        <div className="report-top">
          <nav className="crumb" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden="true">/</span>
            <span>Live</span>
          </nav>
          <span className="report-links">
            {scanId && <Link href={`/report/${scanId}`}>Report</Link>}
            <Link href="/evals">Eval</Link>
            <Link href={`/connect/${projectId}`}>Set up alerts</Link>
          </span>
        </div>

        <div className="live-head">
          <span className="ping" aria-hidden="true" />
          <h1 className="display">{host}</h1>
        </div>
        <p className="live-lede">
            {health?.orchestrator === "down"
              ? "The orchestrator is offline, so texts and fixes are paused. Blocks still show up here."
              : health?.integrations
                ? integrationSummary(health.integrations)
                : "Everything Antibody sees and does on this app, as it happens."}
        </p>

        <div aria-live="assertive">{banner && <BlockedBanner key={banner.id} event={banner} onDone={() => setBanner(null)} />}</div>

        <div className="stats">
          <Stat label="Attacks blocked" value={count("block")} tone="bad" />
          <Stat label="Open findings" value={scan?.findings.length ?? 0} tone="warn" href={scanId && `/report/${scanId}`} />
          <Stat label="Fixes to review" value={fixesAwaitingReview(events)} tone="good" />
          <Stat label="Texts" value={count("message_in", "message_out")} tone="info" />
        </div>

        <div className="live-grid">
          <section className="activity" aria-labelledby="feed-title">
            <div className="finding-row">
              <h2 id="feed-title">Activity</h2>
              <span className="meta">Newest first</span>
            </div>
            {error && <p className="alert">Connection problem: {error}. Retrying…</p>}
            {events.length === 0 ? (
              <p className="sub">
                Nothing yet. <Link href="/#scan">Run a scan</Link> to get started.
              </p>
            ) : (
              <ol>
                {events
                  .slice(-60)
                  .reverse()
                  .map((e) => (
                    <FeedItem key={e.id} event={e} />
                  ))}
              </ol>
            )}
          </section>
          <Phone thread={thread} startCode={startCode} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone, href }: { label: string; value: number; tone: string; href?: string }) {
  const body = (
    <>
      <b className={value ? tone : ""}>{value}</b>
      <span>{label}</span>
    </>
  );
  return href ? (
    <Link href={href} className="stat">
      {body}
    </Link>
  ) : (
    <div className="stat">{body}</div>
  );
}

function sourceLabel(source: ActivityEvent["source"]) {
  if (source === "chalk") return "Chalk";
  if (source === "local") return "On-device";
  if (source === "fail_open") return "Fail open";
  return "";
}

function FeedItem({ event: e }: { event: ActivityEvent }) {
  const tone = FEED_TONE[e.type] ?? "";
  const who = e.type === "block" ? sourceLabel(e.source) : "";
  return (
    <li className={`event ${e.type === "block" ? "alarm" : ""}`}>
      <span className="feed-marks">
        <span className={`feed-tag ${tone}`}>{ACTIVITY_LABEL[e.type] ?? e.type}</span>
        {who && <span className={`feed-tag ${e.source === "chalk" ? "info" : ""}`}>{who}</span>}
      </span>
      <div>
        <h3>
          {e.title}
          <time dateTime={e.at}>{timeAgo(e.at)}</time>
        </h3>
        {e.detail && <p>{e.detail}</p>}
      </div>
    </li>
  );
}

/** The owner's phone: Antibody's texts arrive on the left, the owner's replies go out on the right. */
function Phone({ thread, startCode }: { thread: ActivityEvent[]; startCode?: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight; // not scrollIntoView: that would scroll the projector page
  }, [thread.length]);
  return (
    <section aria-label="iMessage thread" className="live-phone">
      <div className="handset">
        <div className="handset-top">
          <span className="avatar">
            <Logo className="h-5 w-5" />
          </span>
          <span>Antibody</span>
        </div>
        <div ref={box} className="handset-thread">
          {thread.length === 0 && <p className="empty">No messages yet</p>}
          {thread.map((e) =>
            e.type === "call" ? (
              <p key={e.id} className="call">
                <Icon name="phone" className="h-3 w-3" /> {e.title}
                {e.detail && <span>{e.detail}</span>}
              </p>
            ) : (
              // title is the message text; detail is delivery metadata ("[mock iMessage, not sent] to …0100")
              <p key={e.id} className={`text ${e.type === "message_in" ? "out" : "in"}`}>
                {e.title}
                {e.detail && <small>{e.detail}</small>}
              </p>
            ),
          )}
        </div>
        <div className="handset-input">iMessage</div>
      </div>
      <p className="phone-note">
        {startCode ? (
          <>Link your phone: text <b>START {startCode}</b> to the Antibody line. Other numbers can&apos;t see or approve anything.</>
        ) : (
          <>Sign in as this site&apos;s owner to link your phone.</>
        )}
      </p>
    </section>
  );
}
