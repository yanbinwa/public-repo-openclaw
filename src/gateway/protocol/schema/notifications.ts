import { Type } from "typebox";
import { NonEmptyString } from "./primitives.js";

// --- Notification schemas ---

export const NotificationTypeSchema = Type.String({
  enum: [
    "agent.completed",
    "agent.error",
    "exec.finished",
    "exec.denied",
    "approval.requested",
    "system",
  ],
});

export const NotificationSchema = Type.Object(
  {
    id: NonEmptyString,
    type: NotificationTypeSchema,
    title: Type.String(),
    body: Type.String(),
    read: Type.Boolean(),
    ts: Type.Number(),
  },
  { additionalProperties: false },
);

export const NotificationsListParamsSchema = Type.Object({}, { additionalProperties: false });

export const NotificationsReadParamsSchema = Type.Object(
  {
    id: NonEmptyString,
  },
  { additionalProperties: false },
);

export const NotificationsDismissParamsSchema = Type.Object(
  {
    id: NonEmptyString,
  },
  { additionalProperties: false },
);

export const NotificationsClearParamsSchema = Type.Object({}, { additionalProperties: false });

export type NotificationsListParams = Record<string, never>;
export type NotificationsReadParams = { id: string };
export type NotificationsDismissParams = { id: string };
export type NotificationsClearParams = Record<string, never>;
