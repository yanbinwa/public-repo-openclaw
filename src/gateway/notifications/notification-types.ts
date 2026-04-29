/**
 * Types for the real-time notification system.
 *
 * Activity notifications are dispatched via the existing gateway broadcast
 * infrastructure and optionally delivered over an SSE fallback endpoint.
 */

/** Supported activity types that can trigger a notification. */
export type NotificationActivityType =
  | "agent.completed"
  | "chat.mention"
  | "cron.failed"
  | "approval.requested";

/** Notification severity / visual weight. */
export type NotificationLevel = "info" | "warning" | "error";

/** Core notification payload broadcast as a `notification` event. */
export type NotificationPayload = {
  /** Unique id (monotonic counter or UUID — kept simple here). */
  id: string;
  /** Activity that triggered the notification. */
  activity: NotificationActivityType;
  /** Human-readable title (short, ≤120 chars). */
  title: string;
  /** Human-readable body (detail text). */
  body: string;
  /** ISO-8601 timestamp. */
  timestamp: string;
  /** Originating subsystem / module. */
  source: string;
  /** Visual severity. */
  level: NotificationLevel;
};

/** Per-connection notification preference filter. */
export type NotificationPreferences = {
  /** Activity types the client does NOT want to receive. */
  disabledActivities: Set<NotificationActivityType>;
};
