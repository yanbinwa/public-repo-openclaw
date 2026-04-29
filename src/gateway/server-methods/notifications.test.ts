import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorCodes } from "../protocol/index.js";
import { notificationHandlers } from "./notifications.js";

vi.mock("../../infra/notification-preferences.js", () => ({
  getNotificationPreferences: vi.fn(),
  setNotificationPreferences: vi.fn(),
}));

vi.mock("../../infra/notification-service.js", () => ({
  dispatchNotification: vi.fn(),
}));

import {
  getNotificationPreferences,
  setNotificationPreferences,
} from "../../infra/notification-preferences.js";
import { dispatchNotification } from "../../infra/notification-service.js";

type RespondCall = [boolean, unknown?, { code: number; message: string }?];

function createInvokeParams(method: string, params: Record<string, unknown>) {
  const respond = vi.fn();
  return {
    respond,
    invoke: async () =>
      await notificationHandlers[method]({
        params,
        respond: respond as never,
        context: {} as never,
        client: null,
        req: { type: "req" as const, id: "req-1", method },
        isWebchatConnect: () => false,
      }),
  };
}

function expectInvalidRequestResponse(
  respond: ReturnType<typeof vi.fn>,
  expectedMessagePart: string,
) {
  const call = respond.mock.calls[0] as RespondCall | undefined;
  expect(call?.[0]).toBe(false);
  expect(call?.[2]?.code).toBe(ErrorCodes.INVALID_REQUEST);
  expect(call?.[2]?.message).toContain(expectedMessagePart);
}

describe("notifications.preferences.get handler", () => {
  beforeEach(() => {
    vi.mocked(getNotificationPreferences).mockClear();
    vi.mocked(setNotificationPreferences).mockClear();
  });

  it("returns global preferences when no subscriptionId", async () => {
    const prefs = {
      enabledCategories: ["chat", "agent"],
      muted: false,
      updatedAtMs: 1000,
    };
    vi.mocked(getNotificationPreferences).mockResolvedValue(prefs as never);

    const { respond, invoke } = createInvokeParams("notifications.preferences.get", {});
    await invoke();

    expect(getNotificationPreferences).toHaveBeenCalledWith(undefined);
    const call = respond.mock.calls[0] as RespondCall;
    expect(call[0]).toBe(true);
    expect(call[1]).toEqual(prefs);
  });

  it("passes subscriptionId when provided", async () => {
    const prefs = {
      enabledCategories: ["chat"],
      muted: true,
      updatedAtMs: 2000,
    };
    vi.mocked(getNotificationPreferences).mockResolvedValue(prefs as never);

    const { respond, invoke } = createInvokeParams("notifications.preferences.get", {
      subscriptionId: "sub-123",
    });
    await invoke();

    expect(getNotificationPreferences).toHaveBeenCalledWith("sub-123");
    const call = respond.mock.calls[0] as RespondCall;
    expect(call[0]).toBe(true);
    expect(call[1]).toEqual(prefs);
  });
});

describe("notifications.preferences.set handler", () => {
  beforeEach(() => {
    vi.mocked(setNotificationPreferences).mockClear();
  });

  it("updates preferences with valid params", async () => {
    const updated = {
      enabledCategories: ["chat", "cron"],
      muted: false,
      updatedAtMs: 3000,
    };
    vi.mocked(setNotificationPreferences).mockResolvedValue(updated as never);

    const { respond, invoke } = createInvokeParams("notifications.preferences.set", {
      enabledCategories: ["chat", "cron"],
      muted: false,
    });
    await invoke();

    expect(setNotificationPreferences).toHaveBeenCalledWith({
      subscriptionId: undefined,
      enabledCategories: ["chat", "cron"],
      muted: false,
    });
    const call = respond.mock.calls[0] as RespondCall;
    expect(call[0]).toBe(true);
    expect(call[1]).toEqual(updated);
  });

  it("rejects invalid params with unknown properties", async () => {
    const { respond, invoke } = createInvokeParams("notifications.preferences.set", {
      badField: true,
    });
    await invoke();
    expectInvalidRequestResponse(respond, "invalid notifications.preferences.set params");
  });
});

describe("notifications.send handler", () => {
  beforeEach(() => {
    vi.mocked(dispatchNotification).mockClear();
  });

  it("dispatches notification with valid params", async () => {
    vi.mocked(dispatchNotification).mockResolvedValue({
      id: "notif-1",
      webPushResults: [],
      broadcastPayload: {
        id: "notif-1",
        title: "Hello",
        category: "chat",
        timestamp: 1000,
      },
    });

    const { respond, invoke } = createInvokeParams("notifications.send", {
      title: "Hello",
      body: "World",
      category: "chat",
    });
    await invoke();

    expect(dispatchNotification).toHaveBeenCalledWith({
      title: "Hello",
      body: "World",
      category: "chat",
      tag: undefined,
      url: undefined,
    });
    const call = respond.mock.calls[0] as RespondCall;
    expect(call[0]).toBe(true);
    expect(call[1]).toMatchObject({ id: "notif-1" });
  });

  it("rejects when title is missing", async () => {
    const { respond, invoke } = createInvokeParams("notifications.send", {
      body: "No title",
    });
    await invoke();
    expectInvalidRequestResponse(respond, "invalid notifications.send params");
  });

  it("defaults category to chat when not provided", async () => {
    vi.mocked(dispatchNotification).mockResolvedValue({
      id: "notif-2",
      webPushResults: [],
      broadcastPayload: {
        id: "notif-2",
        title: "Test",
        category: "chat",
        timestamp: 2000,
      },
    });

    const { respond, invoke } = createInvokeParams("notifications.send", {
      title: "Test",
    });
    await invoke();

    expect(dispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({ category: "chat" }),
    );
    const call = respond.mock.calls[0] as RespondCall;
    expect(call[0]).toBe(true);
  });
});
