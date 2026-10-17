// iMessage via Photon 2.0 beta (@photon-ai/api 0.5.0), or a mock that only writes to the activity feed.
import { Photon } from "@photon-ai/api";
import { hasRemoteStore, logActivity, readNamedRow, writeNamedRow } from "@antibody/core";
import { isLive, maskHandle } from "./integrations.ts";

export interface Inbound {
  from: string;
  /** Untrusted user text. Never interpret it as anything but data. */
  text: string;
}
export type InboundHandler = (msg: Inbound) => Promise<void>;
export interface SendOpts {
  projectId: string;
  refId?: string;
}

export interface Messenger {
  readonly mode: "live" | "mock";
  send(to: string, text: string, opts: SendOpts): Promise<void>;
  /** Lets `handle` text the agent; returns the Antibody number that handle should text. */
  registerSender(handle: string): Promise<string>;
  start(onInbound: InboundHandler): void;
  /** One inbox check. The setup page calls this because a Vercel process does not keep the timer alive while idle. */
  pollOnce(): Promise<{ handled: number; error?: string; inbox?: number }>;
  stop(): void;
}

function logOut(mode: string, to: string, text: string, opts: SendOpts) {
  return logActivity({
    projectId: opts.projectId,
    type: "message_out",
    title: text.slice(0, 280),
    detail: `${mode === "mock" ? "[mock iMessage, not sent] " : ""}to ${maskHandle(to)}`,
    channel: "imessage",
    refId: opts.refId,
  });
}

export class MockMessenger implements Messenger {
  readonly mode = "mock" as const;
  private onInbound?: InboundHandler;
  async send(to: string, text: string, opts: SendOpts) {
    console.log(`[mock imessage] -> ${maskHandle(to)}: ${text}`);
    await logOut(this.mode, to, text, opts);
  }
  start(onInbound: InboundHandler) {
    this.onInbound = onInbound;
  }
  async pollOnce() {
    return { handled: 0 };
  }
  stop() {}
  async registerSender(handle: string) {
    console.log(`[mock imessage] would register ${maskHandle(handle)} with Photon`);
    return process.env.PHOTON_AGENT_HANDLE?.trim() || "+15555550199";
  }
  /** Mock mode's "phone": POST /inbound lands here. */
  async simulateInbound(msg: Inbound) {
    await this.onInbound?.(msg);
  }
}

// Only the fields we read from a Photon Message (the SDK's union has a platform: "UNKNOWN" variant without them).
interface PhotonMsg {
  id: string;
  createdAt: string;
  status: string;
  content?: { type?: string; text?: string };
  sentBy?: { id?: string; kind?: string; handle?: string };
  receivedBy?: { id?: string; kind?: string; handle?: string };
  space?: { id?: string; kind?: string };
}

/** Where to reply to a handle. Photon docs: take spaceId/senderId from the incoming message; never construct them. */
interface Route {
  spaceId: string;
  senderId: string;
  lastMessageId: string;
}

const SEEN_ROW = "photon-seen-v2";
const HANDLE_WINDOW_MS = 6 * 60 * 60_000;
const START_WINDOW_MS = 7 * 24 * 60 * 60_000;

export class PhotonMessenger implements Messenger {
  readonly mode = "live" as const;
  private photon = new Photon({ headers: { Authorization: `Bearer ${process.env.PHOTON_API_KEY}` } });
  private projectId = process.env.PHOTON_PROJECT_ID!;
  private platform = process.env.PHOTON_PLATFORM || "imessage";
  // Routes live in this process. Seen ids are also stored so a restarted instance does not answer the same text twice.
  private routes = new Map<string, Route>();
  private seen = new Set<string>();
  private skipLogged = new Set<string>();
  private since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  private inbound?: InboundHandler;
  private inflight?: Promise<{ handled: number; error?: string; inbox?: number; notes?: string[] }>;
  private notes: string[] = [];
  private timer?: NodeJS.Timeout;

  async send(to: string, text: string, opts: SendOpts) {
    const route = this.routes.get(to);
    if (!route) {
      // A shared iMessage line can't start a conversation: the human has to text first (that's what START is for).
      console.warn(`[photon] no open thread with ${maskHandle(to)}; they need to text START first. Message not sent.`);
      await logActivity({ projectId: opts.projectId, type: "message_out", title: text.slice(0, 280), detail: `not sent: ${maskHandle(to)} hasn't texted the agent yet`, channel: "imessage", refId: opts.refId });
      return;
    }
    await this.photon.projects.sendMessage({
      path: { id: this.projectId },
      headers: { "idempotency-key": crypto.randomUUID() },
      body: {
        spaceId: route.spaceId,
        senderId: route.senderId,
        parentMessageId: route.lastMessageId,
        content: { type: "text", format: "plain", text },
      },
    });
    await logOut(this.mode, to, text, opts);
  }

  /**
   * Photon's shared iMessage lines only accept texts from handles registered on the project (one seat each,
   * 25 in shared mode). Reuses an existing registration; Photon picks the line for a new one.
   */
  async registerSender(handle: string) {
    const path = { id: this.projectId };
    const { assignments } = await this.photon.projects.platforms.imessage.assignments.list({ path });
    const existing = assignments.find((a) => a.handle === handle && !a.releasedAt);
    if (existing) return existing.assignedPhoneNumber;
    const created = await this.photon.projects.platforms.imessage.assignments.create({
      path,
      body: { handle },
      // Stable per handle: a retry after a timeout returns the same registration instead of taking a second seat.
      headers: { idempotencyKey: `antibody-register-${handle}` },
    });
    return created.assignedPhoneNumber;
  }

  start(onInbound: InboundHandler) {
    this.inbound = onInbound;
    // ponytail: 2s polling as in Photon's iMessage quickstart. On Vercel the process sleeps when idle, so the setup page also calls pollOnce.
    void this.pollOnce();
    this.timer = setInterval(() => void this.pollOnce(), 2000);
  }

  pollOnce(): Promise<{ handled: number; error?: string; inbox?: number; notes?: string[] }> {
    if (!this.inflight) this.inflight = this.poll().finally(() => { this.inflight = undefined; });
    return this.inflight;
  }

  /** Accepts one page of messages. Returns how many were handed to the conversation. */
  private async consume(items: unknown[], repliedStart: Set<string>, fresh: string[]): Promise<number> {
    let handled = 0;
    for (const raw of items) {
      const m = raw as unknown as PhotonMsg;
      const from = m.sentBy?.handle;
      // Rebuild the reply route even for a text we already answered, so a restart can still send.
      if (m.status === "received" && from && m.space?.id && m.receivedBy?.id) {
        this.routes.set(from, { spaceId: m.space.id, senderId: m.receivedBy.id, lastMessageId: m.id });
      }
      if (this.seen.has(m.id)) continue;
      const sentKind = m.sentBy?.kind ?? "";
      const spaceKind = m.space?.kind ?? "";
      const acceptable = m.status === "received" && Boolean(from) && Boolean(m.space?.id) && Boolean(m.receivedBy?.id) && !/agent|bot|system|service/i.test(sentKind) && !/group/i.test(spaceKind);
      const platform = (raw as { platform?: string }).platform ?? "?";
      const text = m.content?.type === "text" ? (m.content.text ?? "") : "";
      const isStart = /^start\b/i.test(text);
      const age = Date.now() - Date.parse(m.createdAt);
      // A START code is the link step, so keep it eligible for a week. Other texts stay on the short window.
      const recent = age < (isStart ? START_WINDOW_MS : HANDLE_WINDOW_MS);
      const reason = this.seen.has(m.id) ? "seen" : !acceptable ? "skip" : !text ? "no-text" : !recent ? "old" : "ok";
      if (this.notes.length < 8) this.notes.push(`${m.status}/${platform}/${m.content?.type ?? "-"}/${sentKind || "-"}/${spaceKind || "-"}/${reason}/len${text.length}/age${Math.round(age / 60000)}m/start${isStart ? 1 : 0}`);
      if (!acceptable) {
        if (!this.skipLogged.has(m.id)) {
          this.skipLogged.add(m.id);
          console.log(`[photon] skipped status=${m.status} platform=${platform} sentKind=${sentKind || "?"} spaceKind=${spaceKind || "?"} content=${m.content?.type ?? "?"}`);
        }
        continue;
      }
      if (text && recent && from) {
        // Several START texts while we were asleep should get one reply, not one per bubble.
        if (!(isStart && repliedStart.has(from))) {
          await this.inbound!({ from, text });
          handled++;
          if (isStart) repliedStart.add(from);
        }
        this.seen.add(m.id);
        fresh.push(m.id);
      } else if (!recent && acceptable) {
        this.seen.add(m.id);
        fresh.push(m.id);
      }
    }
    return handled;
  }

  private async loadSeen() {
    if (!hasRemoteStore()) return;
    const row = await readNamedRow<{ ids: string[] }>(SEEN_ROW);
    for (const id of row?.ids ?? []) this.seen.add(id);
  }

  private async saveSeen() {
    if (!hasRemoteStore()) return;
    const prev = await readNamedRow<{ ids: string[] }>(SEEN_ROW);
    const ids = [...new Set([...(prev?.ids ?? []), ...this.seen])].slice(-400);
    this.seen = new Set(ids);
    await writeNamedRow(SEEN_ROW, { ids });
  }

  private async poll(): Promise<{ handled: number; error?: string; inbox?: number; notes?: string[] }> {
    if (!this.inbound) return { handled: 0 };
    let handled = 0;
    const fresh: string[] = [];
    const repliedStart = new Set<string>();
    this.notes = [];
    try {
      await this.loadSeen();
      let pageToken: string | undefined;
      let newest = this.since;
      let filteredCount = 0;
      const path = { id: this.projectId };
      do {
        const page = await this.photon.projects.listMessages({
          path,
          query: { createdSince: this.since, direction: "received", order: "asc", pageSize: 100, platform: this.platform, pageToken },
        });
        filteredCount += page.items.length;
        handled += await this.consume(page.items, repliedStart, fresh);
        pageToken = page.nextPageToken;
        const last = page.items.at(-1) as unknown as PhotonMsg | undefined;
        if (last) newest = last.createdAt;
      } while (pageToken);
      // Move the window only after paging finishes (a pageToken needs the same query). Inclusive bound; `seen` dedupes.
      this.since = newest;
      let inbox: number | undefined;
      if (handled === 0) {
        // The platform filter can hide texts. Count the project inbox and read a short unfiltered sample.
        const week = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
        const [all, recent, sample] = await Promise.all([
          this.photon.projects.countMessages({ path }),
          this.photon.projects.countMessages({ path, query: { createdSince: week } }),
          this.photon.projects.listMessages({ path, query: { createdSince: week, order: "desc", pageSize: 10 } }),
        ]);
        const n = (c: { count?: number }) => (typeof c.count === "number" ? c.count : -1);
        inbox = n(all);
        console.log(`[photon] inbox total=${inbox} week=${n(recent)} filtered=${filteredCount} sample=${sample.items.length}`);
        for (const raw of sample.items.slice(0, 5)) {
          const m = raw as unknown as PhotonMsg & { platform?: string };
          console.log(`[photon] sample status=${m.status} platform=${m.platform ?? "?"} sentKind=${m.sentBy?.kind ?? "?"} spaceKind=${m.space?.kind ?? "?"} content=${m.content?.type ?? "?"}`);
        }
        handled += await this.consume([...sample.items].reverse(), repliedStart, fresh);
      }
      if (fresh.length) await this.saveSeen();
      if (handled) console.log(`[photon] handled ${handled} inbound`);
      return { handled, inbox, notes: this.notes };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[photon] poll failed:", message.slice(0, 300));
      if (fresh.length) await this.saveSeen().catch(() => undefined);
      return { handled, error: message.slice(0, 200) };
    }
  }

  stop() {
    clearInterval(this.timer);
  }
}

export const createMessenger = (): Messenger => (isLive("photon") ? new PhotonMessenger() : new MockMessenger());
