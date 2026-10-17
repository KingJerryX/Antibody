// iMessage via Photon 2.0 beta (@photon-ai/api 0.5.0), or a mock that only writes to the activity feed.
import { Photon } from "@photon-ai/api";
import { logActivity, newId } from "@antibody/core";
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
  idempotencyKey?: string;
}

export interface Messenger {
  readonly mode: "live" | "mock";
  send(to: string, text: string, opts: SendOpts): Promise<void>;
  start(onInbound: InboundHandler): void;
  stop(): void;
}

function logOut(mode: string, to: string, text: string, opts: SendOpts) {
  logActivity({
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
    logOut(this.mode, to, text, opts);
  }
  start(onInbound: InboundHandler) {
    this.onInbound = onInbound;
  }
  stop() {}
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

export class PhotonMessenger implements Messenger {
  readonly mode = "live" as const;
  private photon = new Photon({ headers: { Authorization: `Bearer ${process.env.PHOTON_API_KEY}` } });
  private projectId = process.env.PHOTON_PROJECT_ID!;
  private platform = process.env.PHOTON_PLATFORM || "imessage";
  // ponytail: in-memory routes + seen ids; rebuilt on boot from the last 24h of messages. Persist if we run >1 process.
  private routes = new Map<string, Route>();
  private seen = new Set<string>();
  private timer?: NodeJS.Timeout;
  private startedAt = new Date();

  async send(to: string, text: string, opts: SendOpts) {
    const route = this.routes.get(to);
    if (!route) {
      // A shared iMessage line can't start a conversation: the human has to text first (that's what START is for).
      console.warn(`[photon] no open thread with ${maskHandle(to)}; they need to text START first. Message not sent.`);
      logActivity({ projectId: opts.projectId, type: "message_out", title: text.slice(0, 280), detail: `not sent: ${maskHandle(to)} hasn't texted the agent yet`, channel: "imessage", refId: opts.refId });
      return;
    }
    await this.photon.projects.sendMessage({
      path: { id: this.projectId },
      headers: { "idempotency-key": opts.idempotencyKey ?? newId("antibody-send") },
      body: {
        spaceId: route.spaceId,
        senderId: route.senderId,
        parentMessageId: route.lastMessageId,
        content: { type: "text", format: "plain", text },
      },
    });
    logOut(this.mode, to, text, opts);
  }

  start(onInbound: InboundHandler) {
    // First poll looks back 24h only to rebuild reply routes; messages older than startup are not handled.
    let since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    let busy = false;
    const poll = async () => {
      if (busy) return;
      busy = true;
      try {
        let pageToken: string | undefined;
        let newest = since;
        do {
          const page = await this.photon.projects.listMessages({
            path: { id: this.projectId },
            query: { createdSince: since, direction: "received", order: "asc", pageSize: 100, platform: this.platform, pageToken },
          });
          for (const raw of page.items) {
            const m = raw as unknown as PhotonMsg;
            if (this.seen.has(m.id)) continue;
            this.seen.add(m.id);
            const from = m.sentBy?.handle;
            if (m.status !== "received" || m.sentBy?.kind !== "human" || !from || !m.space?.id || !m.receivedBy?.id) continue;
            if (this.platform === "imessage" && m.space.kind !== "direct") continue;
            this.routes.set(from, { spaceId: m.space.id, senderId: m.receivedBy.id, lastMessageId: m.id });
            const text = m.content?.type === "text" ? (m.content.text ?? "") : "";
            if (text && new Date(m.createdAt) >= this.startedAt) await onInbound({ from, text });
          }
          pageToken = page.nextPageToken;
          const last = page.items.at(-1) as unknown as PhotonMsg | undefined;
          if (last) newest = last.createdAt;
        } while (pageToken);
        // Move the window only after paging finishes (a pageToken needs the same query). Inclusive bound; `seen` dedupes.
        since = newest;
      } catch (err) {
        console.error("[photon] poll failed:", err instanceof Error ? err.message : err);
      } finally {
        busy = false;
      }
    };
    // ponytail: 2s polling as in Photon's iMessage quickstart; switch to the Socket.IO live feed with replay cursors for production.
    void poll();
    this.timer = setInterval(poll, 2000);
  }

  stop() {
    clearInterval(this.timer);
  }
}

export const createMessenger = (): Messenger => (isLive("photon") ? new PhotonMessenger() : new MockMessenger());
