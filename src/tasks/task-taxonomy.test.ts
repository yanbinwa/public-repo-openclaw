import { describe, expect, it } from "vitest";
import type { TaskRecord } from "./task-registry.types.js";
import {
  TASK_BLOCKER_CLASSES,
  TASK_FAILURE_CLASSES,
  blockerClassLabel,
  classifyTaskBlocker,
  classifyTaskFailure,
  createEmptyBlockerClassCounts,
  createEmptyFailureClassCounts,
  failureClassLabel,
  isRetryableFailure,
  isTransientFailure,
} from "./task-taxonomy.js";

function createTask(partial: Partial<TaskRecord>): TaskRecord {
  return {
    taskId: partial.taskId ?? "task-1",
    runtime: partial.runtime ?? "acp",
    requesterSessionKey: partial.requesterSessionKey ?? "agent:main:main",
    ownerKey: partial.ownerKey ?? "agent:main:main",
    scopeKind: partial.scopeKind ?? "session",
    task: partial.task ?? "Background task",
    status: partial.status ?? "queued",
    deliveryStatus: partial.deliveryStatus ?? "pending",
    notifyPolicy: partial.notifyPolicy ?? "done_only",
    createdAt: partial.createdAt ?? 1,
    ...partial,
  };
}

describe("task-taxonomy", () => {
  describe("classifyTaskFailure", () => {
    it("returns undefined for non-failure statuses", () => {
      expect(classifyTaskFailure(createTask({ status: "queued" }))).toBeUndefined();
      expect(classifyTaskFailure(createTask({ status: "running" }))).toBeUndefined();
      expect(classifyTaskFailure(createTask({ status: "succeeded" }))).toBeUndefined();
      expect(classifyTaskFailure(createTask({ status: "cancelled" }))).toBeUndefined();
    });

    it("returns persisted failureClass when set", () => {
      expect(
        classifyTaskFailure(
          createTask({ status: "failed", failureClass: "config_error", error: "timeout" }),
        ),
      ).toBe("config_error");
    });

    it("classifies timed_out status as timeout", () => {
      expect(classifyTaskFailure(createTask({ status: "timed_out" }))).toBe("timeout");
    });

    it("classifies timeout-related errors", () => {
      expect(
        classifyTaskFailure(createTask({ status: "failed", error: "Request timed out" })),
      ).toBe("timeout");
      expect(
        classifyTaskFailure(createTask({ status: "failed", error: "deadline exceeded" })),
      ).toBe("timeout");
    });

    it("classifies transport errors", () => {
      expect(classifyTaskFailure(createTask({ status: "failed", error: "ECONNREFUSED" }))).toBe(
        "transport_error",
      );
      expect(classifyTaskFailure(createTask({ status: "failed", error: "fetch failed" }))).toBe(
        "transport_error",
      );
      expect(classifyTaskFailure(createTask({ status: "failed", error: "socket hang up" }))).toBe(
        "transport_error",
      );
    });

    it("classifies provider errors", () => {
      expect(classifyTaskFailure(createTask({ status: "failed", error: "rate limit hit" }))).toBe(
        "provider_error",
      );
      expect(classifyTaskFailure(createTask({ status: "failed", error: "HTTP 429" }))).toBe(
        "provider_error",
      );
      expect(
        classifyTaskFailure(createTask({ status: "failed", error: "service unavailable" })),
      ).toBe("provider_error");
    });

    it("classifies config errors", () => {
      expect(
        classifyTaskFailure(createTask({ status: "failed", error: "permission denied" })),
      ).toBe("config_error");
      expect(classifyTaskFailure(createTask({ status: "failed", error: "unauthorized 401" }))).toBe(
        "config_error",
      );
    });

    it("classifies tool runtime errors", () => {
      expect(
        classifyTaskFailure(createTask({ status: "failed", error: "tool execution error" })),
      ).toBe("tool_runtime_error");
      expect(classifyTaskFailure(createTask({ status: "failed", error: "sandbox crashed" }))).toBe(
        "tool_runtime_error",
      );
    });

    it("classifies interrupted errors", () => {
      expect(
        classifyTaskFailure(createTask({ status: "failed", error: "process interrupted" })),
      ).toBe("interrupted");
      expect(classifyTaskFailure(createTask({ status: "failed", error: "gateway restart" }))).toBe(
        "interrupted",
      );
    });

    it("falls back to unknown_failure", () => {
      expect(classifyTaskFailure(createTask({ status: "failed", error: "something weird" }))).toBe(
        "unknown_failure",
      );
      expect(classifyTaskFailure(createTask({ status: "failed" }))).toBe("unknown_failure");
    });

    it("classifies lost tasks", () => {
      expect(classifyTaskFailure(createTask({ status: "lost" }))).toBe("unknown_failure");
      expect(classifyTaskFailure(createTask({ status: "lost", error: "ECONNRESET" }))).toBe(
        "transport_error",
      );
    });
  });

  describe("classifyTaskBlocker", () => {
    it("returns persisted blockerClass when set", () => {
      expect(
        classifyTaskBlocker({
          blockerClass: "approval_required",
          blockedSummary: "something else",
        }),
      ).toBe("approval_required");
    });

    it("classifies approval-related summaries", () => {
      expect(classifyTaskBlocker({ blockedSummary: "Needs approval from admin" })).toBe(
        "approval_required",
      );
      expect(classifyTaskBlocker({ blockedSummary: "Requires authorization" })).toBe(
        "approval_required",
      );
    });

    it("falls back to external_wait", () => {
      expect(classifyTaskBlocker({ blockedSummary: "waiting for deploy" })).toBe("external_wait");
      expect(classifyTaskBlocker({})).toBe("external_wait");
    });
  });

  describe("predicates", () => {
    it("isRetryableFailure returns true for retryable classes", () => {
      expect(isRetryableFailure("transport_error")).toBe(true);
      expect(isRetryableFailure("provider_error")).toBe(true);
      expect(isRetryableFailure("timeout")).toBe(true);
      expect(isRetryableFailure("config_error")).toBe(false);
      expect(isRetryableFailure("tool_runtime_error")).toBe(false);
      expect(isRetryableFailure("interrupted")).toBe(false);
      expect(isRetryableFailure("unknown_failure")).toBe(false);
    });

    it("isTransientFailure returns true for transient classes", () => {
      expect(isTransientFailure("transport_error")).toBe(true);
      expect(isTransientFailure("timeout")).toBe(true);
      expect(isTransientFailure("provider_error")).toBe(false);
    });
  });

  describe("labels", () => {
    it("returns human-readable labels for all failure classes", () => {
      for (const cls of TASK_FAILURE_CLASSES) {
        expect(typeof failureClassLabel(cls)).toBe("string");
        expect(failureClassLabel(cls).length).toBeGreaterThan(0);
      }
    });

    it("returns human-readable labels for all blocker classes", () => {
      for (const cls of TASK_BLOCKER_CLASSES) {
        expect(typeof blockerClassLabel(cls)).toBe("string");
        expect(blockerClassLabel(cls).length).toBeGreaterThan(0);
      }
    });
  });

  describe("count factories", () => {
    it("createEmptyFailureClassCounts has a key for every failure class", () => {
      const counts = createEmptyFailureClassCounts();
      for (const cls of TASK_FAILURE_CLASSES) {
        expect(counts[cls]).toBe(0);
      }
    });

    it("createEmptyBlockerClassCounts has a key for every blocker class", () => {
      const counts = createEmptyBlockerClassCounts();
      for (const cls of TASK_BLOCKER_CLASSES) {
        expect(counts[cls]).toBe(0);
      }
    });
  });
});
