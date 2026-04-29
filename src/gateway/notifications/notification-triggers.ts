/**
 * Notification trigger wiring.
 *
 * Provides factory functions that hook into the existing gateway broadcast
 * call sites to dispatch notifications through the {@link NotificationService}.
 *
 * These are intentionally thin wrappers — the caller decides when to fire them
 * based on the existing event flow.
 */

import type { NotificationService } from "./notification-service.js";
import type { NotificationActivityType, NotificationLevel } from "./notification-types.js";

export type NotificationTriggers = {
  /** Call when an agent run completes (success or failure). */
  onAgentCompleted: (params: { agentId: string; sessionKey: string; success: boolean }) => void;
  /** Call when a user is mentioned in a chat message. */
  onChatMention: (params: { sessionKey: string; from: string; preview: string }) => void;
  /** Call when a cron job fails. */
  onCronFailed: (params: { jobId: string; jobName?: string; error: string }) => void;
  /** Call when an execution approval is requested. */
  onApprovalRequested: (params: { approvalId: string; command: string }) => void;
};

/**
 * Create a set of notification trigger callbacks wired to the given
 * notification service.
 */
export function createNotificationTriggers(service: NotificationService): NotificationTriggers {
  return {
    onAgentCompleted({ agentId, sessionKey, success }) {
      service.dispatch({
        activity: "agent.completed",
        title: success ? `Agent completed: ${agentId}` : `Agent failed: ${agentId}`,
        body: `Session ${sessionKey} ${success ? "finished successfully" : "finished with errors"}.`,
        source: "agent",
        level: success ? "info" : "error",
      });
    },

    onChatMention({ sessionKey, from, preview }) {
      service.dispatch({
        activity: "chat.mention",
        title: `Mentioned by ${from}`,
        body: preview.length > 100 ? `${preview.slice(0, 97)}...` : preview,
        source: "chat",
        level: "info",
      });
    },

    onCronFailed({ jobId, jobName, error }) {
      service.dispatch({
        activity: "cron.failed",
        title: `Cron job failed: ${jobName ?? jobId}`,
        body: error.length > 200 ? `${error.slice(0, 197)}...` : error,
        source: "cron",
        level: "error",
      });
    },

    onApprovalRequested({ approvalId, command }) {
      service.dispatch({
        activity: "approval.requested",
        title: "Approval requested",
        body: `Command "${command}" requires approval (${approvalId}).`,
        source: "approval",
        level: "warning",
      });
    },
  };
}
