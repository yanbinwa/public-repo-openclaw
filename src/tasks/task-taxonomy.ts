/**
 * Shared blocker/failure taxonomy for the task system.
 *
 * Centralizes machine-readable classification of *why* a task is blocked or
 * failed so that audits, summaries, user-facing messages, and future retry
 * logic can all use the same vocabulary.
 */

import type { TaskRecord } from "./task-registry.types.js";

// ---------------------------------------------------------------------------
// Failure classes — why a task ended in a failure state
// ---------------------------------------------------------------------------

export type TaskFailureClass =
  | "tool_runtime_error"
  | "provider_error"
  | "transport_error"
  | "config_error"
  | "timeout"
  | "interrupted"
  | "unknown_failure";

export const TASK_FAILURE_CLASSES: readonly TaskFailureClass[] = [
  "tool_runtime_error",
  "provider_error",
  "transport_error",
  "config_error",
  "timeout",
  "interrupted",
  "unknown_failure",
] as const;

// ---------------------------------------------------------------------------
// Blocker classes — why a task/flow is blocked
// ---------------------------------------------------------------------------

export type TaskBlockerClass = "approval_required" | "external_wait";

export const TASK_BLOCKER_CLASSES: readonly TaskBlockerClass[] = [
  "approval_required",
  "external_wait",
] as const;

// ---------------------------------------------------------------------------
// Predicate helpers — enable retry logic without bespoke heuristics
// ---------------------------------------------------------------------------

const RETRYABLE_FAILURES = new Set<TaskFailureClass>([
  "transport_error",
  "provider_error",
  "timeout",
]);

const TRANSIENT_FAILURES = new Set<TaskFailureClass>(["transport_error", "timeout"]);

export function isRetryableFailure(cls: TaskFailureClass): boolean {
  return RETRYABLE_FAILURES.has(cls);
}

export function isTransientFailure(cls: TaskFailureClass): boolean {
  return TRANSIENT_FAILURES.has(cls);
}

// ---------------------------------------------------------------------------
// Failure classification — derive class from a TaskRecord
// ---------------------------------------------------------------------------

/**
 * Classify why a task failed. Returns a `TaskFailureClass` for any task in
 * a failure-like terminal state, or `undefined` for non-failure states.
 *
 * Priority:
 * 1. If the task already carries a persisted `failureClass`, return it as-is.
 * 2. Derive from `status` (e.g. `timed_out` → `timeout`).
 * 3. Pattern-match the `error` string.
 * 4. Fall back to `"unknown_failure"`.
 */
export function classifyTaskFailure(
  task: Pick<TaskRecord, "status" | "error" | "failureClass">,
): TaskFailureClass | undefined {
  if (task.status !== "failed" && task.status !== "timed_out" && task.status !== "lost") {
    return undefined;
  }

  if (task.failureClass) {
    return task.failureClass;
  }

  if (task.status === "timed_out") {
    return "timeout";
  }

  const error = task.error?.toLowerCase() ?? "";

  if (matchesTimeout(error)) {
    return "timeout";
  }
  if (matchesTransport(error)) {
    return "transport_error";
  }
  if (matchesProvider(error)) {
    return "provider_error";
  }
  if (matchesConfig(error)) {
    return "config_error";
  }
  if (matchesToolRuntime(error)) {
    return "tool_runtime_error";
  }
  if (matchesInterrupted(error)) {
    return "interrupted";
  }

  return "unknown_failure";
}

// ---------------------------------------------------------------------------
// Blocker classification — derive class from blocked metadata
// ---------------------------------------------------------------------------

export type BlockerClassificationInput = {
  blockedSummary?: string;
  blockerClass?: TaskBlockerClass;
};

/**
 * Classify why a task or flow is blocked.
 *
 * Priority:
 * 1. If `blockerClass` is already set, return it.
 * 2. Pattern-match `blockedSummary`.
 * 3. Fall back to `"external_wait"`.
 */
export function classifyTaskBlocker(input: BlockerClassificationInput): TaskBlockerClass {
  if (input.blockerClass) {
    return input.blockerClass;
  }

  const summary = input.blockedSummary?.toLowerCase() ?? "";

  if (matchesApproval(summary)) {
    return "approval_required";
  }

  return "external_wait";
}

// ---------------------------------------------------------------------------
// Human-readable label for user-facing messages
// ---------------------------------------------------------------------------

const FAILURE_LABELS: Record<TaskFailureClass, string> = {
  tool_runtime_error: "Tool error",
  provider_error: "Provider error",
  transport_error: "Transport error",
  config_error: "Configuration error",
  timeout: "Timeout",
  interrupted: "Interrupted",
  unknown_failure: "Error",
};

const BLOCKER_LABELS: Record<TaskBlockerClass, string> = {
  approval_required: "Approval required",
  external_wait: "Waiting on external",
};

export function failureClassLabel(cls: TaskFailureClass): string {
  return FAILURE_LABELS[cls];
}

export function blockerClassLabel(cls: TaskBlockerClass): string {
  return BLOCKER_LABELS[cls];
}

// ---------------------------------------------------------------------------
// Empty count maps for summaries
// ---------------------------------------------------------------------------

export type TaskFailureClassCounts = Record<TaskFailureClass, number>;
export type TaskBlockerClassCounts = Record<TaskBlockerClass, number>;

export function createEmptyFailureClassCounts(): TaskFailureClassCounts {
  return {
    tool_runtime_error: 0,
    provider_error: 0,
    transport_error: 0,
    config_error: 0,
    timeout: 0,
    interrupted: 0,
    unknown_failure: 0,
  };
}

export function createEmptyBlockerClassCounts(): TaskBlockerClassCounts {
  return {
    approval_required: 0,
    external_wait: 0,
  };
}

// ---------------------------------------------------------------------------
// Pattern helpers (private)
// ---------------------------------------------------------------------------

function matchesTimeout(error: string): boolean {
  return (
    error.includes("timed out") || error.includes("timeout") || error.includes("deadline exceeded")
  );
}

function matchesTransport(error: string): boolean {
  return (
    error.includes("econnrefused") ||
    error.includes("econnreset") ||
    error.includes("enotfound") ||
    error.includes("network") ||
    error.includes("socket hang up") ||
    error.includes("fetch failed") ||
    error.includes("transport")
  );
}

function matchesProvider(error: string): boolean {
  return (
    error.includes("provider") ||
    error.includes("rate limit") ||
    error.includes("429") ||
    error.includes("503") ||
    error.includes("502") ||
    error.includes("service unavailable") ||
    error.includes("quota exceeded") ||
    error.includes("api error")
  );
}

function matchesConfig(error: string): boolean {
  return (
    error.includes("config") ||
    error.includes("invalid key") ||
    error.includes("missing key") ||
    error.includes("permission denied") ||
    error.includes("unauthorized") ||
    error.includes("forbidden") ||
    error.includes("401") ||
    error.includes("403")
  );
}

function matchesToolRuntime(error: string): boolean {
  return (
    error.includes("tool") ||
    error.includes("runtime error") ||
    error.includes("execution error") ||
    error.includes("sandbox")
  );
}

function matchesInterrupted(error: string): boolean {
  return (
    error.includes("interrupted") ||
    error.includes("cancelled") ||
    error.includes("aborted") ||
    error.includes("gateway restart")
  );
}

function matchesApproval(summary: string): boolean {
  return (
    summary.includes("approval") ||
    summary.includes("approve") ||
    summary.includes("review") ||
    summary.includes("permission") ||
    summary.includes("authorize") ||
    summary.includes("authorization")
  );
}
