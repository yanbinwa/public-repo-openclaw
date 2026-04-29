/**
 * Core notification service.
 *
 * Aggregates user-activity events, maps them to {@link NotificationPayload},
 * checks per-connection preferences, and dispatches via the existing gateway
 * broadcast infrastructure. Keeps an in-memory ring buffer of recent
 * notifications for the `notification.list` method.
 */

import type { GatewayBroadcastFn, GatewayBroadcastToConnIdsFn } from "../server-broadcast-types.js";
import type {
  NotificationActivityType,
  NotificationLevel,
  NotificationPayload,
  NotificationPreferences,
} from "./notification-types.js";

export type { NotificationPayload, NotificationPreferences };

// ── Ring buffer ──────────────────────────────────────────────────────────────

const DEFAULT_BUFFER_CAPACITY = 100;

/** In-memory ring buffer that keeps the last N notifications. */
export class NotificationBuffer {
  private readonly items: NotificationPayload[] = [];
  private readonly capacity: number;

  constructor(capacity = DEFAULT_BUFFER_CAPACITY) {
    this.capacity = capacity;
  }

  push(item: NotificationPayload): void {
    if (this.items.length >= this.capacity) {
      this.items.shift();
    }
    this.items.push(item);
  }

  list(limit?: number): NotificationPayload[] {
    const n = Math.min(limit ?? this.capacity, this.items.length);
    return this.items.slice(-n);
  }

  clear(): void {
    this.items.length = 0;
  }

  get size(): number {
    return this.items.length;
  }
}

// ── ID generator ─────────────────────────────────────────────────────────────

let idCounter = 0;

function nextId(): string {
  return `ntf_${Date.now()}_${++idCounter}`;
}

// ── SSE subscriber registry ──────────────────────────────────────────────────

export type SseSubscriber = {
  id: string;
  write: (data: string) => boolean;
  close: () => void;
};

// ── Notification service ─────────────────────────────────────────────────────

export type NotificationServiceDeps = {
  broadcast: GatewayBroadcastFn;
  broadcastToConnIds?: GatewayBroadcastToConnIdsFn;
};

export class NotificationService {
  readonly buffer: NotificationBuffer;

  /** connId → preferences */
  private readonly preferences = new Map<string, NotificationPreferences>();

  /** SSE subscribers */
  private readonly sseSubscribers = new Map<string, SseSubscriber>();

  private broadcast: GatewayBroadcastFn;

  constructor(deps: NotificationServiceDeps, bufferCapacity?: number) {
    this.broadcast = deps.broadcast;
    this.buffer = new NotificationBuffer(bufferCapacity);
  }

  // ── Dispatch ─────────────────────────────────────────────────────────────

  /**
   * Create and dispatch a notification. This is the main entry point called
   * from activity hooks (agent completed, chat mention, cron failure, etc.).
   */
  dispatch(params: {
    activity: NotificationActivityType;
    title: string;
    body: string;
    source: string;
    level?: NotificationLevel;
  }): NotificationPayload {
    const notification: NotificationPayload = {
      id: nextId(),
      activity: params.activity,
      title: params.title,
      body: params.body,
      timestamp: new Date().toISOString(),
      source: params.source,
      level: params.level ?? "info",
    };

    this.buffer.push(notification);

    // Broadcast over WebSocket to all READ_SCOPE clients.
    this.broadcast("notification", notification, { dropIfSlow: true });

    // Deliver to SSE subscribers.
    for (const sub of this.sseSubscribers.values()) {
      try {
        sub.write(`data: ${JSON.stringify(notification)}\n\n`);
      } catch {
        /* best-effort */
      }
    }

    return notification;
  }

  // ── History ──────────────────────────────────────────────────────────────

  list(limit?: number): NotificationPayload[] {
    return this.buffer.list(limit);
  }

  // ── Preferences ──────────────────────────────────────────────────────────

  setPreferences(connId: string, prefs: NotificationPreferences): void {
    this.preferences.set(connId, prefs);
  }

  getPreferences(connId: string): NotificationPreferences {
    return this.preferences.get(connId) ?? { disabledActivities: new Set() };
  }

  removePreferences(connId: string): void {
    this.preferences.delete(connId);
  }

  // ── SSE ──────────────────────────────────────────────────────────────────

  addSseSubscriber(subscriber: SseSubscriber): void {
    this.sseSubscribers.set(subscriber.id, subscriber);
  }

  removeSseSubscriber(id: string): void {
    this.sseSubscribers.delete(id);
  }

  get sseSubscriberCount(): number {
    return this.sseSubscribers.size;
  }

  // ── Testing helpers ──────────────────────────────────────────────────────

  /** @internal — for tests only */
  __resetForTest(): void {
    this.buffer.clear();
    this.preferences.clear();
    this.sseSubscribers.clear();
    idCounter = 0;
  }
}
