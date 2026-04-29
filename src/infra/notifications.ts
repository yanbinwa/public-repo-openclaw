// Persistent notification store with real-time event emission.
// Follows the same JSON-file + async-lock pattern as push-apns.ts.

import { randomUUID } from "node:crypto";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";
import { notifyListeners, registerListener } from "../shared/listeners.js";
import { createAsyncLock, readJsonFile, writeJsonAtomic } from "./json-files.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationType =
  | "agent.completed"
  | "agent.error"
  | "exec.finished"
  | "exec.denied"
  | "approval.requested"
  | "system";

export type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  ts: number;
};

export type NotificationEvent = {
  kind: "created" | "updated" | "dismissed" | "cleared";
  notification?: Notification;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NOTIFICATIONS_FILENAME = "notifications/notifications.json";
const MAX_NOTIFICATIONS = 100;
const withLock = createAsyncLock();

// ---------------------------------------------------------------------------
// Event emitter
// ---------------------------------------------------------------------------

const listeners = new Set<(event: NotificationEvent) => void>();

export function onNotificationEvent(listener: (event: NotificationEvent) => void): () => void {
  return registerListener(listeners, listener);
}

function emitNotificationEvent(event: NotificationEvent): void {
  notifyListeners(listeners, event);
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

function resolveNotificationsPath(baseDir?: string): string {
  const root = baseDir ?? resolveStateDir();
  return path.join(root, NOTIFICATIONS_FILENAME);
}

async function loadNotifications(baseDir?: string): Promise<Notification[]> {
  const filePath = resolveNotificationsPath(baseDir);
  const data = await readJsonFile<Notification[]>(filePath);
  return Array.isArray(data) ? data : [];
}

async function saveNotifications(notifications: Notification[], baseDir?: string): Promise<void> {
  const filePath = resolveNotificationsPath(baseDir);
  await writeJsonAtomic(filePath, notifications);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function createNotification(params: {
  type: NotificationType;
  title: string;
  body: string;
  baseDir?: string;
}): Promise<Notification> {
  return withLock(async () => {
    const notifications = await loadNotifications(params.baseDir);
    const notification: Notification = {
      id: randomUUID(),
      type: params.type,
      title: params.title,
      body: params.body,
      read: false,
      ts: Date.now(),
    };
    notifications.push(notification);

    // Evict oldest when over cap
    while (notifications.length > MAX_NOTIFICATIONS) {
      notifications.shift();
    }

    await saveNotifications(notifications, params.baseDir);
    emitNotificationEvent({ kind: "created", notification });
    return notification;
  });
}

export async function listNotifications(baseDir?: string): Promise<Notification[]> {
  return withLock(async () => {
    const notifications = await loadNotifications(baseDir);
    // Return newest-first
    return [...notifications].reverse();
  });
}

export async function markNotificationRead(
  id: string,
  baseDir?: string,
): Promise<Notification | null> {
  return withLock(async () => {
    const notifications = await loadNotifications(baseDir);
    const notification = notifications.find((n) => n.id === id);
    if (!notification) {
      return null;
    }
    notification.read = true;
    await saveNotifications(notifications, baseDir);
    emitNotificationEvent({ kind: "updated", notification });
    return notification;
  });
}

export async function dismissNotification(id: string, baseDir?: string): Promise<boolean> {
  return withLock(async () => {
    const notifications = await loadNotifications(baseDir);
    const index = notifications.findIndex((n) => n.id === id);
    if (index === -1) {
      return false;
    }
    const [removed] = notifications.splice(index, 1);
    await saveNotifications(notifications, baseDir);
    emitNotificationEvent({ kind: "dismissed", notification: removed });
    return true;
  });
}

export async function clearNotifications(baseDir?: string): Promise<number> {
  return withLock(async () => {
    const notifications = await loadNotifications(baseDir);
    const count = notifications.length;
    if (count === 0) {
      return 0;
    }
    await saveNotifications([], baseDir);
    emitNotificationEvent({ kind: "cleared" });
    return count;
  });
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

export function resetNotificationListenersForTest(): void {
  listeners.clear();
}
