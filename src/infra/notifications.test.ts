import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  clearNotifications,
  createNotification,
  dismissNotification,
  listNotifications,
  markNotificationRead,
  onNotificationEvent,
  resetNotificationListenersForTest,
  type NotificationEvent,
} from "./notifications.js";

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "notifications-test-"));
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

afterEach(async () => {
  resetNotificationListenersForTest();
  // Clean the notifications file between tests
  const filePath = path.join(tmpDir, "notifications", "notifications.json");
  await fs.rm(filePath, { force: true }).catch(() => {});
});

describe("createNotification", () => {
  it("creates a notification and persists it", async () => {
    const n = await createNotification({
      type: "system",
      title: "Hello",
      body: "World",
      baseDir: tmpDir,
    });
    expect(n.id).toBeDefined();
    expect(n.type).toBe("system");
    expect(n.title).toBe("Hello");
    expect(n.body).toBe("World");
    expect(n.read).toBe(false);
    expect(n.ts).toBeGreaterThan(0);

    const list = await listNotifications(tmpDir);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(n.id);
  });

  it("emits a created event", async () => {
    const events: NotificationEvent[] = [];
    onNotificationEvent((evt) => events.push(evt));

    await createNotification({
      type: "agent.completed",
      title: "Done",
      body: "Agent finished",
      baseDir: tmpDir,
    });

    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("created");
    expect(events[0].notification?.title).toBe("Done");
  });
});

describe("listNotifications", () => {
  it("returns empty array when no notifications exist", async () => {
    const list = await listNotifications(tmpDir);
    expect(list).toEqual([]);
  });

  it("returns notifications in newest-first order", async () => {
    await createNotification({ type: "system", title: "First", body: "", baseDir: tmpDir });
    await createNotification({ type: "system", title: "Second", body: "", baseDir: tmpDir });

    const list = await listNotifications(tmpDir);
    expect(list).toHaveLength(2);
    expect(list[0].title).toBe("Second");
    expect(list[1].title).toBe("First");
  });
});

describe("markNotificationRead", () => {
  it("marks a notification as read", async () => {
    const n = await createNotification({
      type: "system",
      title: "Test",
      body: "",
      baseDir: tmpDir,
    });
    expect(n.read).toBe(false);

    const updated = await markNotificationRead(n.id, tmpDir);
    expect(updated).not.toBeNull();
    expect(updated!.read).toBe(true);

    const list = await listNotifications(tmpDir);
    expect(list[0].read).toBe(true);
  });

  it("returns null for non-existent id", async () => {
    const result = await markNotificationRead("non-existent", tmpDir);
    expect(result).toBeNull();
  });

  it("emits an updated event", async () => {
    const n = await createNotification({
      type: "system",
      title: "Test",
      body: "",
      baseDir: tmpDir,
    });

    const events: NotificationEvent[] = [];
    onNotificationEvent((evt) => events.push(evt));

    await markNotificationRead(n.id, tmpDir);

    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("updated");
  });
});

describe("dismissNotification", () => {
  it("removes a notification", async () => {
    const n = await createNotification({
      type: "system",
      title: "Test",
      body: "",
      baseDir: tmpDir,
    });

    const result = await dismissNotification(n.id, tmpDir);
    expect(result).toBe(true);

    const list = await listNotifications(tmpDir);
    expect(list).toHaveLength(0);
  });

  it("returns false for non-existent id", async () => {
    const result = await dismissNotification("non-existent", tmpDir);
    expect(result).toBe(false);
  });

  it("emits a dismissed event", async () => {
    const n = await createNotification({
      type: "system",
      title: "Test",
      body: "",
      baseDir: tmpDir,
    });

    const events: NotificationEvent[] = [];
    onNotificationEvent((evt) => events.push(evt));

    await dismissNotification(n.id, tmpDir);

    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("dismissed");
    expect(events[0].notification?.id).toBe(n.id);
  });
});

describe("clearNotifications", () => {
  it("clears all notifications and returns count", async () => {
    await createNotification({ type: "system", title: "A", body: "", baseDir: tmpDir });
    await createNotification({ type: "system", title: "B", body: "", baseDir: tmpDir });

    const count = await clearNotifications(tmpDir);
    expect(count).toBe(2);

    const list = await listNotifications(tmpDir);
    expect(list).toHaveLength(0);
  });

  it("returns 0 when already empty", async () => {
    const count = await clearNotifications(tmpDir);
    expect(count).toBe(0);
  });

  it("emits a cleared event", async () => {
    await createNotification({ type: "system", title: "A", body: "", baseDir: tmpDir });

    const events: NotificationEvent[] = [];
    onNotificationEvent((evt) => events.push(evt));

    await clearNotifications(tmpDir);

    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("cleared");
    expect(events[0].notification).toBeUndefined();
  });
});

describe("eviction", () => {
  it("evicts oldest notifications when exceeding max capacity", async () => {
    // Create 101 notifications (max is 100)
    for (let i = 0; i < 101; i++) {
      await createNotification({
        type: "system",
        title: `N-${i}`,
        body: "",
        baseDir: tmpDir,
      });
    }

    const list = await listNotifications(tmpDir);
    expect(list).toHaveLength(100);
    // Oldest (N-0) should have been evicted, newest first
    expect(list[0].title).toBe("N-100");
    expect(list[99].title).toBe("N-1");
  });
});
