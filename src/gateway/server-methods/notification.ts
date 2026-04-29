/**
 * Gateway request handlers for the notification subsystem.
 *
 * Methods:
 *  - notification.list        — return recent notifications from the ring buffer
 *  - notification.subscribe   — (no-op ack; real delivery is via broadcast events)
 *  - notification.preferences — get/set per-connection disabled activity filters
 */

import type { NotificationService } from "../notifications/notification-service.js";
import type { NotificationActivityType } from "../notifications/notification-types.js";
import type {
  NotificationListParams,
  NotificationPreferencesParams,
  NotificationSubscribeParams,
} from "../protocol/schema/notification.js";
import type { GatewayRequestHandler, GatewayRequestHandlers } from "./shared-types.js";

const VALID_ACTIVITIES = new Set<string>([
  "agent.completed",
  "chat.mention",
  "cron.failed",
  "approval.requested",
]);

export function createNotificationHandlers(
  notificationService: NotificationService,
): GatewayRequestHandlers {
  const listHandler: GatewayRequestHandler = ({ params, respond }) => {
    const { limit } = params as unknown as NotificationListParams;
    const notifications = notificationService.list(limit);
    respond(true, { notifications });
  };

  const subscribeHandler: GatewayRequestHandler = ({ respond }) => {
    // Subscription is implicit — all READ_SCOPE clients receive notification
    // broadcast events. This method exists so clients can explicitly signal
    // interest and receive a confirmation.
    respond(true, { ok: true });
  };

  const preferencesHandler: GatewayRequestHandler = ({ params, client, respond }) => {
    const { disabledActivities } = params as unknown as NotificationPreferencesParams;
    const connId = client?.connId ?? "";

    if (disabledActivities !== undefined) {
      // Validate activity types.
      const invalid = disabledActivities.filter((a) => !VALID_ACTIVITIES.has(a));
      if (invalid.length > 0) {
        respond(false, undefined, {
          code: "invalid_activity",
          message: `Unknown activity types: ${invalid.join(", ")}`,
        });
        return;
      }

      notificationService.setPreferences(connId, {
        disabledActivities: new Set(disabledActivities as NotificationActivityType[]),
      });
    }

    const prefs = notificationService.getPreferences(connId);
    respond(true, {
      disabledActivities: Array.from(prefs.disabledActivities),
    });
  };

  return {
    "notification.list": listHandler,
    "notification.subscribe": subscribeHandler,
    "notification.preferences": preferencesHandler,
  };
}
