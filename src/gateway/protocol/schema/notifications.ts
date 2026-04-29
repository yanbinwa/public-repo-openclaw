import { Type } from "typebox";

// --- Notification event categories ---

/**
 * Event categories that can trigger notifications.
 * Maps to gateway event families.
 */
export const NOTIFICATION_CATEGORIES = ["chat", "agent", "session", "approval", "cron"] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

// --- Notification preferences schemas ---

const NotificationCategorySchema = Type.String({
  enum: [...NOTIFICATION_CATEGORIES],
});

export const NotificationPreferencesGetParamsSchema = Type.Object(
  {
    subscriptionId: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

export const NotificationPreferencesSetParamsSchema = Type.Object(
  {
    subscriptionId: Type.Optional(Type.String({ minLength: 1 })),
    enabledCategories: Type.Optional(Type.Array(NotificationCategorySchema, { uniqueItems: true })),
    muted: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

export const NotificationSendParamsSchema = Type.Object(
  {
    title: Type.String({ minLength: 1 }),
    body: Type.Optional(Type.String()),
    category: Type.Optional(NotificationCategorySchema),
    tag: Type.Optional(Type.String()),
    url: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

// --- Type definitions ---

export type NotificationPreferencesGetParams = {
  subscriptionId?: string;
};

export type NotificationPreferencesSetParams = {
  subscriptionId?: string;
  enabledCategories?: NotificationCategory[];
  muted?: boolean;
};

export type NotificationSendParams = {
  title: string;
  body?: string;
  category?: NotificationCategory;
  tag?: string;
  url?: string;
};

export type NotificationPreferences = {
  enabledCategories: NotificationCategory[];
  muted: boolean;
  updatedAtMs: number;
};

// --- Notification event payload ---

export type NotificationEventPayload = {
  id: string;
  title: string;
  body?: string;
  category: NotificationCategory;
  tag?: string;
  url?: string;
  timestamp: number;
};
