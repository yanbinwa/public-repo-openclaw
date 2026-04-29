import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotificationService, NotificationBuffer } from "./notification-service.js";
import type { NotificationPayload } from "./notification-types.js";

// ── NotificationBuffer ───────────────────────────────────────────────────────

describe("NotificationBuffer", () => {
  it("stores and retrieves items", () => {
    const buf = new NotificationBuffer(5);
    const item = makePayload("agent.completed");
    buf.push(item);
    expect(buf.list()).toEqual([item]);
    expect(buf.size).toBe(1);
  });

  it("evicts oldest when capacity exceeded", () => {
    const buf = new NotificationBuffer(3);
    const items = [
      makePayload("agent.completed", "1"),
      makePayload("cron.failed", "2"),
      makePayload("chat.mention", "3"),
      makePayload("approval.requested", "4"),
    ];
    for (const item of items) buf.push(item);
    expect(buf.size).toBe(3);
    expect(buf.list().map((n) => n.id)).toEqual(["2", "3", "4"]);
  });

  it("list(limit) returns last N items", () => {
    const buf = new NotificationBuffer(10);
    for (let i = 0; i < 5; i++) buf.push(makePayload("agent.completed", String(i)));
    expect(buf.list(2).map((n) => n.id)).toEqual(["3", "4"]);
  });

  it("clear() empties the buffer", () => {
    const buf = new NotificationBuffer(5);
    buf.push(makePayload("agent.completed"));
    buf.clear();
    expect(buf.size).toBe(0);
    expect(buf.list()).toEqual([]);
  });
});

// ── NotificationService ──────────────────────────────────────────────────────

describe("NotificationService", () => {
  let broadcast: ReturnType<typeof vi.fn>;
  let service: NotificationService;

  beforeEach(() => {
    broadcast = vi.fn();
    service = new NotificationService({ broadcast }, 50);
    service.__resetForTest();
  });

  it("dispatch() broadcasts a notification event and stores in buffer", () => {
    const result = service.dispatch({
      activity: "agent.completed",
      title: "Agent done",
      body: "Run finished",
      source: "agent",
    });

    expect(result.id).toMatch(/^ntf_/);
    expect(result.activity).toBe("agent.completed");
    expect(result.level).toBe("info");
    expect(broadcast).toHaveBeenCalledWith("notification", result, { dropIfSlow: true });
    expect(service.list()).toEqual([result]);
  });

  it("dispatch() respects level override", () => {
    const result = service.dispatch({
      activity: "cron.failed",
      title: "Cron failed",
      body: "Error",
      source: "cron",
      level: "error",
    });
    expect(result.level).toBe("error");
  });

  it("list(limit) returns limited results", () => {
    for (let i = 0; i < 10; i++) {
      service.dispatch({
        activity: "agent.completed",
        title: `N${i}`,
        body: "",
        source: "test",
      });
    }
    expect(service.list(3)).toHaveLength(3);
    expect(service.list()).toHaveLength(10);
  });

  it("dispatch() writes to SSE subscribers", () => {
    const write = vi.fn().mockReturnValue(true);
    service.addSseSubscriber({ id: "sse-1", write, close: vi.fn() });

    service.dispatch({
      activity: "chat.mention",
      title: "Mention",
      body: "You were mentioned",
      source: "chat",
    });

    expect(write).toHaveBeenCalledOnce();
    const data = write.mock.calls[0]![0] as string;
    expect(data).toMatch(/^data: \{/);
    expect(data).toMatch(/\n\n$/);
  });

  it("removeSseSubscriber stops delivery", () => {
    const write = vi.fn().mockReturnValue(true);
    service.addSseSubscriber({ id: "sse-1", write, close: vi.fn() });
    service.removeSseSubscriber("sse-1");

    service.dispatch({
      activity: "agent.completed",
      title: "Test",
      body: "",
      source: "test",
    });

    expect(write).not.toHaveBeenCalled();
  });

  // ── Preferences ────────────────────────────────────────────────────────

  it("setPreferences / getPreferences round-trips", () => {
    service.setPreferences("conn-1", {
      disabledActivities: new Set(["cron.failed"]),
    });
    const prefs = service.getPreferences("conn-1");
    expect(prefs.disabledActivities.has("cron.failed")).toBe(true);
  });

  it("getPreferences returns empty set for unknown connId", () => {
    const prefs = service.getPreferences("unknown");
    expect(prefs.disabledActivities.size).toBe(0);
  });

  it("removePreferences cleans up", () => {
    service.setPreferences("conn-1", {
      disabledActivities: new Set(["cron.failed"]),
    });
    service.removePreferences("conn-1");
    expect(service.getPreferences("conn-1").disabledActivities.size).toBe(0);
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePayload(activity: NotificationPayload["activity"], id?: string): NotificationPayload {
  return {
    id: id ?? "test-id",
    activity,
    title: "Test",
    body: "Test body",
    timestamp: new Date().toISOString(),
    source: "test",
    level: "info",
  };
}
