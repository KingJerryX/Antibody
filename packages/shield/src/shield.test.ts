import { afterEach, describe, expect, it, vi } from "vitest";
import { createShield, evaluate, recordOutcome, resetShield, type RequestContext } from "./index.ts";

const chalkMock = vi.hoisted(() => ({ mode: "reject" as "reject" | "hang" | "ok" }));
vi.mock("@chalk-ai/client", () => ({
  ChalkClient: class {
    query() {
      if (chalkMock.mode === "reject") return Promise.reject(new Error("connect ECONNREFUSED"));
      if (chalkMock.mode === "hang") return new Promise(() => {});
      return Promise.resolve({
        data: {
          "request.risk_score": { value: 1 },
          "request.decision": { value: "block" },
          "request.reasons": { value: ["from chalk"] },
        },
      });
    }
  },
}));

const T0 = 1_700_000_000_000;
const ctx = (pathname: string, i: number, extra: Partial<RequestContext> = {}): RequestContext => ({
  method: "GET",
  pathname,
  ip: "10.0.0.66",
  sessionId: "attacker",
  at: T0 + i * 3000,
  ...extra,
});

afterEach(() => {
  resetShield();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("local engine", () => {
  it("blocks IDOR enumeration by about request 6", async () => {
    const actions: string[] = [];
    for (let i = 1; i <= 10; i++) actions.push((await evaluate(ctx(`/api/users/${i}`, i))).action);
    const firstStop = actions.findIndex((a) => a !== "allow") + 1;
    expect(firstStop).toBeGreaterThan(2);
    expect(actions[5]).toBe("block"); // request 6
    const d = await evaluate(ctx("/api/users/11", 11));
    expect(d.reasons[0]).toMatch(/read \d+ different users' profiles in \d+s; normal is 1/);
  });

  it("never blocks normal browsing", async () => {
    // 30 users, each with their own session + IP, browsing for 10 minutes.
    for (let u = 0; u < 30; u++) {
      const base = { ip: `10.1.0.${u}`, sessionId: `user-${u}` };
      const steps = [
        ["POST", "/api/login"],
        ["GET", `/api/users/${u}`],
        ["GET", "/api/products"],
        ["GET", "/api/products"],
        ["POST", "/api/chat"],
        ["GET", `/api/users/${u}`],
        ["POST", "/api/chat"],
        ["GET", "/api/orders"],
        ["POST", "/api/chat"],
        ["GET", "/api/products"],
      ];
      for (let r = 0; r < 60; r++) {
        const [method, pathname] = steps[r % steps.length];
        const d = await evaluate({ ...base, method, pathname, at: T0 + r * 10_000 + u * 7 });
        expect(d.action, `${pathname} for user ${u}: ${d.reasons.join("; ")}`).toBe("allow");
      }
    }
  });

  it("blocks a chat flood and repeated failed logins", async () => {
    let last;
    for (let i = 0; i < 12; i++) last = await evaluate(ctx("/api/chat", i, { method: "POST", at: T0 + i * 500 }));
    expect(last!.action).toBe("block");

    const login = { method: "POST", pathname: "/api/login", ip: "10.9.9.9" };
    for (let i = 0; i < 5; i++) recordOutcome({ ...login, at: T0 + i * 1000 }, 401);
    expect((await evaluate({ ...login, at: T0 + 6000 })).action).toBe("block");
  });

  it("forgets requests once they fall out of the window", async () => {
    const hit = (at: number) => evaluate({ method: "GET", pathname: "/api/products", ip: "10.3.3.3", at });
    for (let i = 0; i < 40; i++) await hit(T0 + i * 100);
    expect((await hit(T0 + 4_100)).action).toBe("block");
    expect(await hit(T0 + 4_100 + 60_001)).toMatchObject({ action: "allow", riskScore: 0.03 }); // only itself in the last minute
  });
});

describe("chalk path", () => {
  it("falls back to the local engine when Chalk errors, then skips Chalk for a while", async () => {
    vi.stubEnv("CHALK_CLIENT_ID", "test-id");
    vi.stubEnv("CHALK_CLIENT_SECRET", "test-secret");
    chalkMock.mode = "reject";
    // Chalk being down must not switch the shield off: the local engine still catches enumeration.
    const first = await evaluate(ctx("/api/users/1", 1));
    expect(first).toMatchObject({ action: "allow", source: "local" });
    expect(first.reasons.at(-1)).toMatch(/Chalk unavailable/);
    let d;
    for (let i = 2; i <= 8; i++) d = await evaluate(ctx(`/api/users/${i}`, i));
    expect(d).toMatchObject({ action: "block", source: "local" });
    expect(d!.reasons.at(-1)).toMatch(/Chalk paused/);
  });

  it("stays within the 800ms budget when Chalk hangs, and pauses after repeated timeouts", async () => {
    vi.stubEnv("CHALK_CLIENT_ID", "test-id");
    vi.stubEnv("CHALK_CLIENT_SECRET", "test-secret");
    chalkMock.mode = "hang";
    let t = Date.now();
    expect((await evaluate(ctx("/api/users/1", 1))).source).toBe("local");
    expect(Date.now() - t).toBeLessThan(1200);
    await evaluate(ctx("/api/users/2", 2));
    await evaluate(ctx("/api/users/3", 3)); // third failure opens the pause
    t = Date.now();
    const paused = await evaluate(ctx("/api/users/4", 4));
    expect(Date.now() - t).toBeLessThan(50);
    expect(paused.reasons.at(-1)).toMatch(/Chalk paused/);
  });

  it("uses Chalk's decision when it answers", async () => {
    vi.stubEnv("CHALK_CLIENT_ID", "test-id");
    vi.stubEnv("CHALK_CLIENT_SECRET", "test-secret");
    chalkMock.mode = "ok";
    expect(await evaluate(ctx("/api/users/1", 1))).toEqual({ action: "block", riskScore: 1, reasons: ["from chalk"], source: "chalk" });
  });
});

describe("createShield", () => {
  it("returns 403 on block, reports the event, and ignores static assets", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response("{}")));
    vi.stubGlobal("fetch", fetchMock);
    const shield = createShield({ projectId: "demo" });
    const req = (path: string) =>
      new Request(`http://localhost:4001${path}`, { headers: { cookie: "theme=dark; session=abc123", "x-forwarded-for": "10.2.2.2" } });

    for (let i = 0; i < 100; i++) expect(await shield(req(`/_next/static/chunk-${i}.js`))).toBeUndefined();

    const statuses: number[] = [];
    for (let i = 1; i <= 7; i++) statuses.push((await shield(req(`/api/users/${i}`)))?.status ?? 200);
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    expect(statuses.at(-1)).toBe(403);

    expect(fetchMock).toHaveBeenCalledTimes(1); // throttled: one event per actor per 10s
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ projectId: "demo", type: "block", channel: "web", source: "local" });
    expect(body.riskScore).toBeGreaterThan(0);
    expect(body.detail).not.toContain("abc123"); // session token never leaks
  });
});
