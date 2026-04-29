import {
  getNotificationPreferences,
  setNotificationPreferences,
} from "../../infra/notification-preferences.js";
import { dispatchNotification } from "../../infra/notification-service.js";
import {
  validateNotificationPreferencesGetParams,
  validateNotificationPreferencesSetParams,
  validateNotificationSendParams,
} from "../protocol/index.js";
import { respondInvalidParams, respondUnavailableOnThrow } from "./nodes.helpers.js";
import type { GatewayRequestHandlers } from "./types.js";

export const notificationHandlers: GatewayRequestHandlers = {
  "notifications.preferences.get": async ({ params, respond }) => {
    if (!validateNotificationPreferencesGetParams(params)) {
      respondInvalidParams({
        respond,
        method: "notifications.preferences.get",
        validator: validateNotificationPreferencesGetParams,
      });
      return;
    }

    await respondUnavailableOnThrow(respond, async () => {
      const prefs = await getNotificationPreferences(params.subscriptionId);
      respond(true, prefs, undefined);
    });
  },

  "notifications.preferences.set": async ({ params, respond }) => {
    if (!validateNotificationPreferencesSetParams(params)) {
      respondInvalidParams({
        respond,
        method: "notifications.preferences.set",
        validator: validateNotificationPreferencesSetParams,
      });
      return;
    }

    await respondUnavailableOnThrow(respond, async () => {
      const updated = await setNotificationPreferences({
        subscriptionId: params.subscriptionId,
        enabledCategories: params.enabledCategories,
        muted: params.muted,
      });
      respond(true, updated, undefined);
    });
  },

  "notifications.send": async ({ params, respond }) => {
    if (!validateNotificationSendParams(params)) {
      respondInvalidParams({
        respond,
        method: "notifications.send",
        validator: validateNotificationSendParams,
      });
      return;
    }

    await respondUnavailableOnThrow(respond, async () => {
      const result = await dispatchNotification({
        title: params.title,
        body: params.body,
        category: params.category ?? "chat",
        tag: params.tag,
        url: params.url,
      });
      respond(true, { id: result.id, webPushResults: result.webPushResults }, undefined);
    });
  },
};
