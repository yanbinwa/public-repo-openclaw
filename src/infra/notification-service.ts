import { randomUUID } from "node:crypto";
import type {
  NotificationCategory,
  NotificationEventPayload,
} from "../gateway/protocol/schema/notifications.js";
import { isCategoryEnabled } from "./notification-preferences.js";
import { broadcastWebPush, listWebPushSubscriptions, type WebPushPayload } from "./push-web.js";

// --- Types ---

export type NotificationDispatchResult = {
  id: string;
  webPushResults: Array<{
    ok: boolean;
    subscriptionId: string;
    statusCode?: number;
    error?: string;
  }>;
  broadcastPayload: NotificationEventPayload;
};

// --- Event-to-category mapping ---

/**
 * Maps a gateway event name to a notification category.
 * Returns undefined if the event should not trigger notifications.
 */
export function mapEventToCategory(event: string): NotificationCategory | undefined {
  if (event === "chat" || event.startsWith("chat.")) {
    return "chat";
  }
  if (event === "agent") {
    return "agent";
  }
  if (event === "session.message" || event === "session.tool" || event === "sessions.changed") {
    return "session";
  }
  if (event.startsWith("exec.approval.") || event.startsWith("plugin.approval.")) {
    return "approval";
  }
  if (event === "cron") {
    return "cron";
  }
  return undefined;
}

// --- Notification text extraction ---

/**
 * Extract a human-readable title and body from a gateway event payload.
 */
export function extractNotificationText(
  event: string,
  payload: unknown,
): { title: string; body?: string } {
  const p = payload as Record<string, unknown> | null | undefined;

  switch (mapEventToCategory(event)) {
    case "chat":
      return {
        title: "New message",
        body: typeof p?.text === "string" ? truncate(p.text, 120) : undefined,
      };
    case "agent":
      return {
        title: "Agent activity",
        body: typeof p?.event === "string" ? truncate(p.event, 120) : undefined,
      };
    case "session":
      return {
        title: "Session update",
        body: typeof p?.text === "string" ? truncate(p.text, 120) : undefined,
      };
    case "approval":
      return {
        title: "Approval requested",
        body: typeof p?.description === "string" ? truncate(p.description, 120) : undefined,
      };
    case "cron":
      return {
        title: "Cron job update",
        body: typeof p?.message === "string" ? truncate(p.message, 120) : undefined,
      };
    default:
      return { title: "OpenClaw notification" };
  }
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) {
    return text;
  }
  return text.slice(0, maxLen - 1) + "\u2026";
}

// --- Core dispatch ---

/**
 * Dispatch a notification: send Web Push to all subscribers whose preferences
 * allow this category, and return the broadcast payload for WebSocket delivery.
 */
export async function dispatchNotification(params: {
  title: string;
  body?: string;
  category: NotificationCategory;
  tag?: string;
  url?: string;
}): Promise<NotificationDispatchResult> {
  const id = randomUUID();
  const timestamp = Date.now();

  const broadcastPayload: NotificationEventPayload = {
    id,
    title: params.title,
    body: params.body,
    category: params.category,
    tag: params.tag,
    url: params.url,
    timestamp,
  };

  // Build Web Push payload
  const webPushPayload: WebPushPayload = {
    title: params.title,
    body: params.body,
    tag: params.tag ?? `openclaw-${params.category}`,
    url: params.url,
  };

  // Filter subscriptions by preference
  const allSubscriptions = await listWebPushSubscriptions();
  const eligibleSubscriptions = await Promise.all(
    allSubscriptions.map(async (sub) => ({
      sub,
      enabled: await isCategoryEnabled(params.category, sub.subscriptionId),
    })),
  );

  const enabledSubs = eligibleSubscriptions.filter((s) => s.enabled).map((s) => s.sub);

  // Send Web Push to eligible subscriptions
  let webPushResults: NotificationDispatchResult["webPushResults"] = [];
  if (enabledSubs.length > 0) {
    // Use broadcastWebPush which handles VAPID setup and concurrent sends
    webPushResults = await broadcastWebPush(webPushPayload);
  }

  return {
    id,
    webPushResults,
    broadcastPayload,
  };
}

/**
 * Dispatch a notification triggered by a gateway event.
 * Returns null if the event type is not notifiable.
 */
export async function dispatchEventNotification(
  event: string,
  payload: unknown,
): Promise<NotificationDispatchResult | null> {
  const category = mapEventToCategory(event);
  if (!category) {
    return null;
  }

  const { title, body } = extractNotificationText(event, payload);

  return dispatchNotification({
    title,
    body,
    category,
  });
}
