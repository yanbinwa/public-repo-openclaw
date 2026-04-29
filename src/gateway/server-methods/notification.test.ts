import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotificationService } from "../notifications/notification-service.js";
import { createNotificationHandlers } from "./notification.js";
import type { GatewayRequestHandlerOptions } from "./shared-types.js";

describe("notification gateway handlers", () => {
  let service: NotificationService;
  let handlers: ReturnType<typeof createNotificationHandlers>;
  let respond: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const broadcast = vi.fn();
    service = new NotificationService({ broadcast }, 50);
    service.__resetForTest();
    handlers = createNotificationHandlers(service);
    respond = vi.fn();
  });

  function callHandler(method: string, params: Record<string, unknown> = {}, connId = "conn-1") {
    const handler = handlers[method]!;
    handler({
      params,
      respond,
      client: { connect: {} as any, connId },
      req: { type: "req", id: "1", method } as any,
      isWebchatConnect: () => false,
      context: {} as any,
    } as unknown as GatewayRequestHandlerOptions);
  }

  // ── notification.list ────────────────────────────────────────────────

  describe("notification.list", () => {
    it("returns empty list when no notifications", () => {
      callHandler("notification.list");
      expect(respond).toHaveBeenCalledWith(true, { notifications: [] });
    });

    it("returns notifications from buffer", () => {
      service.dispatch({
        activity: "agent.completed",
        title: "Done",
        body: "Finished",
        source: "agent",
      });
      callHandler("notification.list");
      const payload = respond.mock.calls[0]![1] as { notifications: unknown[] };
      expect(payload.notifications).toHaveLength(1);
    });

    it("respects limit param", () => {
      for (let i = 0; i < 5; i++) {
        service.dispatch({
          activity: "agent.completed",
          title: `N${i}`,
          body: "",
          source: "test",
        });
      }
      callHandler("notification.list", { limit: 2 });
      const payload = respond.mock.calls[0]![1] as { notifications: unknown[] };
      expect(payload.notifications).toHaveLength(2);
    });
  });

  // ── notification.subscribe ───────────────────────────────────────────

  describe("notification.subscribe", () => {
    it("responds with ok", () => {
      callHandler("notification.subscribe");
      expect(respond).toHaveBeenCalledWith(true, { ok: true });
    });
  });

  // ── notification.preferences ─────────────────────────────────────────

  describe("notification.preferences", () => {
    it("returns empty preferences for new connection", () => {
      callHandler("notification.preferences", {});
      expect(respond).toHaveBeenCalledWith(true, { disabledActivities: [] });
    });

    it("sets and returns preferences", () => {
      callHandler("notification.preferences", {
        disabledActivities: ["cron.failed"],
      });
      expect(respond).toHaveBeenCalledWith(true, {
        disabledActivities: ["cron.failed"],
      });
    });

    it("rejects invalid activity types", () => {
      callHandler("notification.preferences", {
        disabledActivities: ["invalid.type"],
      });
      expect(respond).toHaveBeenCalledWith(
        false,
        undefined,
        expect.objectContaining({
          code: "invalid_activity",
        }),
      );
    });
  });
});
