import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getNotificationState,
  isNotificationSupported,
  showDesktopNotification,
  type NotificationEventPayload,
} from "./notifications.js";

// Minimal Notification stub for Node/vitest environment
const FakeNotification = Object.assign(
  function Notification(this: any, title: string, opts?: any) {
    this.title = title;
    this.body = opts?.body;
    this.tag = opts?.tag;
  } as any,
  { permission: "default" as NotificationPermission, requestPermission: vi.fn() },
);

describe("browser notifications", () => {
  let origNotification: typeof globalThis.Notification | undefined;

  beforeEach(() => {
    origNotification = globalThis.Notification;
    globalThis.Notification = FakeNotification as any;
    FakeNotification.permission = "default";
  });

  afterEach(() => {
    if (origNotification !== undefined) {
      globalThis.Notification = origNotification;
    } else {
      // @ts-expect-error — restore absence
      delete globalThis.Notification;
    }
  });

  describe("isNotificationSupported", () => {
    it("returns false when Notification is undefined", () => {
      // @ts-expect-error — testing absence
      delete globalThis.Notification;
      expect(isNotificationSupported()).toBe(false);
    });

    it("returns true when Notification exists", () => {
      expect(isNotificationSupported()).toBe(true);
    });
  });

  describe("getNotificationState", () => {
    it("returns supported state", () => {
      const state = getNotificationState();
      expect(state.supported).toBe(true);
      expect(typeof state.permission).toBe("string");
    });
  });

  describe("showDesktopNotification", () => {
    it("returns null when permission is not granted", () => {
      const payload: NotificationEventPayload = {
        id: "test-1",
        activity: "agent.completed",
        title: "Test",
        body: "Body",
        timestamp: new Date().toISOString(),
        source: "test",
        level: "info",
      };
      const result = showDesktopNotification(payload);
      expect(result).toBeNull();
    });

    it("creates Notification when permission is granted and tab not focused", () => {
      FakeNotification.permission = "granted";
      // Ensure document.hasFocus returns false
      vi.spyOn(document, "hasFocus").mockReturnValue(false);
      const payload: NotificationEventPayload = {
        id: "test-2",
        activity: "agent.completed",
        title: "Done",
        body: "Agent finished",
        timestamp: new Date().toISOString(),
        source: "test",
        level: "info",
      };
      const result = showDesktopNotification(payload);
      expect(result).not.toBeNull();
      expect((result as any).title).toBe("Done");
    });
  });
});
