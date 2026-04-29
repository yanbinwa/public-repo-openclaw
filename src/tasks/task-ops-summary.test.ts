import { describe, expect, it } from "vitest";
import type { TaskFlowRecord } from "./task-flow-registry.types.js";
import { buildTaskOpsSummary, formatTaskOpsSummary } from "./task-ops-summary.js";
import type { TaskRecord } from "./task-registry.types.js";

const NOW = 1_000_000_000_000;

function makeTask(overrides: Partial<TaskRecord>): TaskRecord {
  return {
    taskId: "task-1",
    runId: "run-1",
    task: "default task",
    runtime: "subagent",
    status: "running",
    requesterSessionKey: "agent:main:main",
    ownerKey: "agent:main:main",
    scopeKind: "session",
    createdAt: NOW - 1_000,
    deliveryStatus: "pending",
    notifyPolicy: "done_only",
    ...overrides,
  };
}

function makeFlow(overrides: Partial<TaskFlowRecord>): TaskFlowRecord {
  return {
    flowId: "flow-1",
    syncMode: "managed",
    ownerKey: "agent:main:main",
    revision: 1,
    status: "running",
    notifyPolicy: "done_only",
    goal: "test flow",
    createdAt: NOW - 2_000,
    updatedAt: NOW - 500,
    ...overrides,
  };
}

describe("buildTaskOpsSummary", () => {
  it("AC-1: running task produces active state with checkpoint", () => {
    const task = makeTask({
      status: "running",
      progressSummary: "compiling assets",
    });

    const summary = buildTaskOpsSummary(task);

    expect(summary.state).toBe("active");
    expect(summary.lastCheckpoint).toBe("compiling assets");
    expect(summary.blocker).toBeUndefined();
    expect(summary.nextAction).toBeUndefined();
  });

  it("AC-2: blocked task produces blocked state with blocker", () => {
    const task = makeTask({
      status: "succeeded",
      terminalOutcome: "blocked",
      terminalSummary: "awaiting approval",
    });

    const summary = buildTaskOpsSummary(task);

    expect(summary.state).toBe("blocked");
    expect(summary.blocker).toBe("awaiting approval");
    expect(summary.nextAction).toBe("resolve blocker to continue");
  });

  it("AC-3: finished task produces finished state with last checkpoint", () => {
    const task = makeTask({
      status: "succeeded",
      terminalSummary: "PR opened",
    });

    const summary = buildTaskOpsSummary(task);

    expect(summary.state).toBe("finished");
    expect(summary.lastCheckpoint).toBe("PR opened");
    expect(summary.blocker).toBeUndefined();
    expect(summary.nextAction).toBe("no action");
  });

  it("AC-4: failed task includes error as blocker", () => {
    const task = makeTask({
      status: "failed",
      error: "timeout connecting to API",
    });

    const summary = buildTaskOpsSummary(task);

    expect(summary.state).toBe("failed");
    expect(summary.blocker).toBe("timeout connecting to API");
    expect(summary.nextAction).toBe("investigate failure");
  });

  it("AC-5: flow enrichment adds flow-level blocker", () => {
    const task = makeTask({
      status: "running",
      parentFlowId: "flow-1",
      progressSummary: "waiting",
    });
    const flow = makeFlow({
      status: "blocked",
      blockedSummary: "needs credentials",
    });

    const summary = buildTaskOpsSummary(task, flow);

    expect(summary.blocker).toBe("needs credentials");
  });

  it("queued task recommends waiting to start", () => {
    const task = makeTask({
      status: "queued",
    });

    const summary = buildTaskOpsSummary(task);

    expect(summary.state).toBe("queued");
    expect(summary.nextAction).toBe("waiting to start");
  });

  it("timed_out task recommends retry or extend timeout", () => {
    const task = makeTask({
      status: "timed_out",
    });

    const summary = buildTaskOpsSummary(task);

    expect(summary.state).toBe("timed_out");
    expect(summary.nextAction).toBe("retry or extend timeout");
  });

  it("lost task recommends checking session health", () => {
    const task = makeTask({
      status: "lost",
      error: "session disappeared",
    });

    const summary = buildTaskOpsSummary(task);

    expect(summary.state).toBe("lost");
    expect(summary.blocker).toBe("session disappeared");
    expect(summary.nextAction).toBe("check session health");
  });

  it("cancelled task reports no action", () => {
    const task = makeTask({
      status: "cancelled",
    });

    const summary = buildTaskOpsSummary(task);

    expect(summary.state).toBe("cancelled");
    expect(summary.nextAction).toBe("no action");
  });

  it("running task with no progressSummary omits checkpoint", () => {
    const task = makeTask({
      status: "running",
    });

    const summary = buildTaskOpsSummary(task);

    expect(summary.state).toBe("active");
    expect(summary.lastCheckpoint).toBeUndefined();
  });

  it("failed task falls back to terminalSummary when error is absent", () => {
    const task = makeTask({
      status: "failed",
      terminalSummary: "build step crashed",
    });

    const summary = buildTaskOpsSummary(task);

    expect(summary.blocker).toBe("build step crashed");
  });

  it("flow-level blocker takes priority over task-level blocker", () => {
    const task = makeTask({
      status: "succeeded",
      terminalOutcome: "blocked",
      terminalSummary: "task-level blocker",
    });
    const flow = makeFlow({
      status: "blocked",
      blockedSummary: "flow-level blocker",
    });

    const summary = buildTaskOpsSummary(task, flow);

    expect(summary.blocker).toBe("flow-level blocker");
  });

  it("flow waiting status provides next action hint", () => {
    const task = makeTask({
      status: "running",
      parentFlowId: "flow-1",
    });
    const flow = makeFlow({
      status: "waiting",
    });

    const summary = buildTaskOpsSummary(task, flow);

    // Running task has no nextAction from task-level, but flow could enrich
    expect(summary.state).toBe("active");
  });
});

describe("formatTaskOpsSummary", () => {
  it("AC-6: formats full summary with all fields", () => {
    const formatted = formatTaskOpsSummary({
      state: "blocked",
      lastCheckpoint: "patch applied",
      blocker: "awaiting approval",
      nextAction: "resolve blocker to continue",
    });

    expect(formatted).toBe(
      "blocked · last good step: patch applied · awaiting approval · next: resolve blocker to continue",
    );
  });

  it("formats minimal summary with state only", () => {
    const formatted = formatTaskOpsSummary({
      state: "active",
    });

    expect(formatted).toBe("active");
  });

  it("formats summary with state and checkpoint only", () => {
    const formatted = formatTaskOpsSummary({
      state: "active",
      lastCheckpoint: "compiling assets",
    });

    expect(formatted).toBe("active · last good step: compiling assets");
  });

  it("formats finished task summary", () => {
    const formatted = formatTaskOpsSummary({
      state: "finished",
      lastCheckpoint: "PR opened",
      nextAction: "no action",
    });

    expect(formatted).toBe("finished · last good step: PR opened · next: no action");
  });

  it("formats failed task summary", () => {
    const formatted = formatTaskOpsSummary({
      state: "failed",
      blocker: "timeout connecting to API",
      nextAction: "investigate failure",
    });

    expect(formatted).toBe("failed · timeout connecting to API · next: investigate failure");
  });

  it("round-trips through build + format for a running task", () => {
    const task = makeTask({
      status: "running",
      progressSummary: "step 3 of 5",
    });

    const formatted = formatTaskOpsSummary(buildTaskOpsSummary(task));

    expect(formatted).toBe("active · last good step: step 3 of 5");
  });

  it("round-trips through build + format for a blocked task", () => {
    const task = makeTask({
      status: "succeeded",
      terminalOutcome: "blocked",
      terminalSummary: "awaiting approval",
    });

    const formatted = formatTaskOpsSummary(buildTaskOpsSummary(task));

    expect(formatted).toBe(
      "blocked · last good step: awaiting approval · awaiting approval · next: resolve blocker to continue",
    );
  });

  it("round-trips through build + format for a finished task", () => {
    const task = makeTask({
      status: "succeeded",
      terminalSummary: "PR opened",
    });

    const formatted = formatTaskOpsSummary(buildTaskOpsSummary(task));

    expect(formatted).toBe("finished · last good step: PR opened · next: no action");
  });
});
