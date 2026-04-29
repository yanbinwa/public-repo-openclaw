/**
 * Browser-side notification module.
 *
 * Listens for `notification` events on the gateway WebSocket connection and
 * shows desktop notifications via the Browser Notification API when the tab
 * is not focused.
 */

import type { GatewayBrowserClient } from "./gateway.ts";

export type BrowserNotificationState = {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  enabled: boolean;
};

/** Check whether the browser supports the Notification API. */
export function isNotificationSupported(): boolean {
  return typeof globalThis.Notification !== "undefined";
}

/** Current notification permission state. */
export function getNotificationState(): BrowserNotificationState {
  if (!isNotificationSupported()) {
    return { supported: false, permission: "unsupported", enabled: false };
  }
  return {
    supported: true,
    permission: Notification.permission,
    enabled: Notification.permission === "granted",
  };
}

/**
 * Request notification permission from the user.
 * Returns the new permission state.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) {
    return "denied";
  }
  return Notification.requestPermission();
}

/** Notification payload as received from the gateway `notification` event. */
export type NotificationEventPayload = {
  id: string;
  activity: string;
  title: string;
  body: string;
  timestamp: string;
  source: string;
  level: string;
};

/**
 * Show a browser desktop notification.
 * Only shows when the document is not focused (tab in background / minimized).
 */
export function showDesktopNotification(payload: NotificationEventPayload): Notification | null {
  if (!isNotificationSupported()) {
    return null;
  }
  if (Notification.permission !== "granted") {
    return null;
  }
  // Only show when the tab is not focused.
  if (typeof document !== "undefined" && document.hasFocus()) {
    return null;
  }

  const iconMap: Record<string, string> = {
    error: "/icons/notification-error.png",
    warning: "/icons/notification-warning.png",
    info: "/icons/notification-info.png",
  };

  return new Notification(payload.title, {
    body: payload.body,
    tag: payload.id,
    icon: iconMap[payload.level] ?? iconMap.info,
    timestamp: new Date(payload.timestamp).getTime(),
  });
}

export type NotificationListenerDisposer = () => void;

/**
 * Subscribe to gateway `notification` events and show desktop notifications.
 *
 * Returns a disposer function that removes the listener.
 *
 * Usage:
 * ```ts
 * const dispose = listenForNotifications(client);
 * // later…
 * dispose();
 * ```
 */
export function listenForNotifications(
  client: GatewayBrowserClient,
  opts?: {
    /** Custom handler called for every notification (in addition to desktop). */
    onNotification?: (payload: NotificationEventPayload) => void;
  },
): NotificationListenerDisposer {
  const handler = (payload: unknown) => {
    const p = payload as NotificationEventPayload;
    opts?.onNotification?.(p);
    showDesktopNotification(p);
  };

  client.on("notification", handler);
  return () => client.off("notification", handler);
}
