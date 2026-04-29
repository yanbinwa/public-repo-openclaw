import type { UpdateAvailable } from "../infra/update-startup.js";
import type { NotificationEventPayload } from "./protocol/schema/notifications.js";

export const GATEWAY_EVENT_UPDATE_AVAILABLE = "update.available" as const;

export type GatewayUpdateAvailableEventPayload = {
  updateAvailable: UpdateAvailable | null;
};

export const GATEWAY_EVENT_NOTIFICATION = "notification" as const;

export type GatewayNotificationEventPayload = NotificationEventPayload;
