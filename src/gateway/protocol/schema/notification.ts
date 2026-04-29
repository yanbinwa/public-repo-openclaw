import { Type } from "typebox";
import { NonEmptyString } from "./primitives.js";

// ── Notification event payload schema ────────────────────────────────────────

export const NotificationActivityTypeSchema = Type.String({
  enum: ["agent.completed", "chat.mention", "cron.failed", "approval.requested"],
});

export const NotificationLevelSchema = Type.String({
  enum: ["info", "warning", "error"],
});

export const NotificationPayloadSchema = Type.Object(
  {
    id: NonEmptyString,
    activity: NotificationActivityTypeSchema,
    title: Type.String({ maxLength: 120 }),
    body: Type.String(),
    timestamp: NonEmptyString,
    source: NonEmptyString,
    level: NotificationLevelSchema,
  },
  { additionalProperties: false },
);

// ── Request / response schemas for notification gateway methods ──────────────

export const NotificationListParamsSchema = Type.Object(
  {
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  },
  { additionalProperties: false },
);

export const NotificationListResultSchema = Type.Object(
  {
    notifications: Type.Array(NotificationPayloadSchema),
  },
  { additionalProperties: false },
);

export const NotificationSubscribeParamsSchema = Type.Object(
  {
    activities: Type.Optional(
      Type.Array(NotificationActivityTypeSchema, { minItems: 1, maxItems: 20 }),
    ),
  },
  { additionalProperties: false },
);

export const NotificationSubscribeResultSchema = Type.Object(
  {
    ok: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const NotificationPreferencesParamsSchema = Type.Object(
  {
    disabledActivities: Type.Optional(Type.Array(NotificationActivityTypeSchema, { maxItems: 20 })),
  },
  { additionalProperties: false },
);

export const NotificationPreferencesResultSchema = Type.Object(
  {
    disabledActivities: Type.Array(NotificationActivityTypeSchema),
  },
  { additionalProperties: false },
);

// ── Inferred TS types (for handler convenience) ──────────────────────────────

export type NotificationListParams = {
  limit?: number;
};

export type NotificationListResult = {
  notifications: Array<{
    id: string;
    activity: string;
    title: string;
    body: string;
    timestamp: string;
    source: string;
    level: string;
  }>;
};

export type NotificationSubscribeParams = {
  activities?: string[];
};

export type NotificationPreferencesParams = {
  disabledActivities?: string[];
};
