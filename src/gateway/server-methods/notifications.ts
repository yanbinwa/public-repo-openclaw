import {
  clearNotifications,
  dismissNotification,
  listNotifications,
  markNotificationRead,
} from "../../infra/notifications.js";
import {
  ErrorCodes,
  errorShape,
  validateNotificationsClearParams,
  validateNotificationsDismissParams,
  validateNotificationsListParams,
  validateNotificationsReadParams,
} from "../protocol/index.js";
import { respondInvalidParams, respondUnavailableOnThrow } from "./nodes.helpers.js";
import type { GatewayRequestHandlers } from "./types.js";

export const notificationsHandlers: GatewayRequestHandlers = {
  "notifications.list": async ({ params, respond }) => {
    if (!validateNotificationsListParams(params)) {
      respondInvalidParams({
        respond,
        method: "notifications.list",
        validator: validateNotificationsListParams,
      });
      return;
    }

    await respondUnavailableOnThrow(respond, async () => {
      const notifications = await listNotifications();
      respond(true, { notifications }, undefined);
    });
  },

  "notifications.read": async ({ params, respond }) => {
    if (!validateNotificationsReadParams(params)) {
      respondInvalidParams({
        respond,
        method: "notifications.read",
        validator: validateNotificationsReadParams,
      });
      return;
    }

    await respondUnavailableOnThrow(respond, async () => {
      const notification = await markNotificationRead(params.id);
      if (!notification) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `notification not found: ${params.id}`),
        );
        return;
      }
      respond(true, { notification }, undefined);
    });
  },

  "notifications.dismiss": async ({ params, respond }) => {
    if (!validateNotificationsDismissParams(params)) {
      respondInvalidParams({
        respond,
        method: "notifications.dismiss",
        validator: validateNotificationsDismissParams,
      });
      return;
    }

    await respondUnavailableOnThrow(respond, async () => {
      const removed = await dismissNotification(params.id);
      if (!removed) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `notification not found: ${params.id}`),
        );
        return;
      }
      respond(true, { removed }, undefined);
    });
  },

  "notifications.clear": async ({ params, respond }) => {
    if (!validateNotificationsClearParams(params)) {
      respondInvalidParams({
        respond,
        method: "notifications.clear",
        validator: validateNotificationsClearParams,
      });
      return;
    }

    await respondUnavailableOnThrow(respond, async () => {
      const count = await clearNotifications();
      respond(true, { cleared: count }, undefined);
    });
  },
};
