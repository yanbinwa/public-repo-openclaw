import type { TaskFlowRecord } from "./task-flow-registry.types.js";
import type { TaskRecord } from "./task-registry.types.js";
import { sanitizeTaskStatusText } from "./task-status.js";

/**
 * Compact operational summary for a single task.
 *
 * Designed to answer four questions at a glance:
 * 1. What state is the task in right now?
 * 2. What was the last successful step?
 * 3. What is blocking progress?
 * 4. What should happen next?
 */
export type TaskOpsSummary = {
  /** High-level operational state: active | queued | blocked | finished | failed | cancelled | lost | timed_out */
  state: string;
  /** Last known progress checkpoint or terminal summary, when available. */
  lastCheckpoint?: string;
  /** Current blocker description, when the task is blocked or failed. */
  blocker?: string;
  /** Recommended next action, when deterministically derivable. */
  nextAction?: string;
};

const OPS_SUMMARY_MAX_FIELD_CHARS = 120;

function sanitizeField(value: unknown, opts?: { errorContext?: boolean }): string | undefined {
  const text = sanitizeTaskStatusText(value, {
    errorContext: opts?.errorContext ?? false,
    maxChars: OPS_SUMMARY_MAX_FIELD_CHARS,
  });
  return text || undefined;
}

function resolveOpsState(task: TaskRecord): string {
  if (task.status === "running") {
    return "active";
  }
  if (task.status === "succeeded") {
    if (task.terminalOutcome === "blocked") {
      return "blocked";
    }
    return "finished";
  }
  if (task.status === "queued") {
    return "queued";
  }
  // failed, timed_out, cancelled, lost — pass through as-is
  return task.status;
}

function resolveLastCheckpoint(task: TaskRecord): string | undefined {
  // For active tasks, progressSummary is the current checkpoint
  if (task.status === "running" || task.status === "queued") {
    return sanitizeField(task.progressSummary);
  }
  // For terminal tasks, terminalSummary is the last known step
  return sanitizeField(task.terminalSummary, { errorContext: true });
}

function resolveBlocker(task: TaskRecord, flow?: TaskFlowRecord): string | undefined {
  // Flow-level blocker takes priority when present
  if (flow?.blockedSummary) {
    return sanitizeField(flow.blockedSummary, { errorContext: true });
  }

  // Task-level: blocked outcome
  if (task.terminalOutcome === "blocked") {
    return sanitizeField(task.terminalSummary, { errorContext: true });
  }

  // Task-level: failure error
  if (task.status === "failed" || task.status === "timed_out" || task.status === "lost") {
    return (
      sanitizeField(task.error, { errorContext: true }) ??
      sanitizeField(task.terminalSummary, { errorContext: true })
    );
  }

  return undefined;
}

function resolveNextAction(task: TaskRecord, flow?: TaskFlowRecord): string | undefined {
  // Finished with no blocker — nothing to do
  if (task.status === "succeeded" && task.terminalOutcome !== "blocked") {
    return "no action";
  }

  // Blocked — suggest unblocking
  if (task.terminalOutcome === "blocked") {
    return "resolve blocker to continue";
  }

  // Queued — waiting to start
  if (task.status === "queued") {
    return "waiting to start";
  }

  // Failed / timed_out / lost — suggest retry or investigation
  if (task.status === "failed") {
    return "investigate failure";
  }
  if (task.status === "timed_out") {
    return "retry or extend timeout";
  }
  if (task.status === "lost") {
    return "check session health";
  }

  // Cancelled — no action
  if (task.status === "cancelled") {
    return "no action";
  }

  // Flow-level waiting/blocked hints
  if (flow) {
    if (flow.status === "blocked" || flow.status === "waiting") {
      if (flow.blockedSummary) {
        return "resolve blocker to continue";
      }
      return "waiting for external input";
    }
  }

  // Running — no recommended action (it's in progress)
  return undefined;
}

/**
 * Build a compact operational summary for a task.
 *
 * @param task - The TaskRecord to summarize.
 * @param flow - Optional parent TaskFlowRecord for blocker enrichment.
 * @returns A deterministic TaskOpsSummary derived purely from task/flow state.
 */
export function buildTaskOpsSummary(task: TaskRecord, flow?: TaskFlowRecord): TaskOpsSummary {
  return {
    state: resolveOpsState(task),
    lastCheckpoint: resolveLastCheckpoint(task),
    blocker: resolveBlocker(task, flow),
    nextAction: resolveNextAction(task, flow),
  };
}

/**
 * Format a TaskOpsSummary into a compact single-line string.
 *
 * Output pattern: "<state> [· last good step: <checkpoint>] [· <blocker>] [· next: <action>]"
 *
 * Examples:
 *   "active · last good step: compiling assets"
 *   "blocked · awaiting approval · next: resolve blocker to continue"
 *   "finished · last good step: PR opened · next: no action"
 */
export function formatTaskOpsSummary(summary: TaskOpsSummary): string {
  const parts: string[] = [summary.state];

  if (summary.lastCheckpoint) {
    parts.push(`last good step: ${summary.lastCheckpoint}`);
  }

  if (summary.blocker) {
    parts.push(summary.blocker);
  }

  if (summary.nextAction) {
    parts.push(`next: ${summary.nextAction}`);
  }

  return parts.join(" · ");
}
