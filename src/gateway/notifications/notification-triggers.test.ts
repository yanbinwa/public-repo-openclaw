import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotificationService } from "./notification-service.js";
import { createNotificationTriggers } from "./notification-triggers.js";

describe("notification triggers", () => {
  let service: NotificationService;
  let triggers: ReturnType<typeof createNotificationTriggers>;

  beforeEach(() => {
    const broadcast = vi.fn();
    service = new NotificationService({ broadcast }, 50);
    service.__resetForTest();
    triggers = createNotificationTriggers(service);
  });

  it("onAgentCompleted dispatches success notification", () => {
    triggers.onAgentCompleted({
      agentId: "main",
      sessionKey: "agent:main:main",
      success: true,
    });
    const list = service.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.activity).toBe("agent.completed");
    expect(list[0]!.level).toBe("info");
    expect(list[0]!.title).toContain("completed");
  });

  it("onAgentCompleted dispatches failure notification", () => {
    triggers.onAgentCompleted({
      agentId: "main",
      sessionKey: "agent:main:main",
      success: false,
    });
    const list = service.list();
    expect(list[0]!.level).toBe("error");
    expect(list[0]!.title).toContain("failed");
  });

  it("onChatMention dispatches notification with truncated preview", () => {
    triggers.onChatMention({
      sessionKey: "session-1",
      from: "user",
      preview: "a".repeat(200),
    });
    const list = service.list();
    expect(list[0]!.activity).toBe("chat.mention");
    expect(list[0]!.body.length).toBeLessThanOrEqual(100);
    expect(list[0]!.body).toMatch(/\.\.\.$/);
  });

  it("onCronFailed dispatches error notification", () => {
    triggers.onCronFailed({
      jobId: "job-1",
      jobName: "daily-backup",
      error: "Connection refused",
    });
    const list = service.list();
    expect(list[0]!.activity).toBe("cron.failed");
    expect(list[0]!.level).toBe("error");
    expect(list[0]!.title).toContain("daily-backup");
  });

  it("onApprovalRequested dispatches warning notification", () => {
    triggers.onApprovalRequested({
      approvalId: "apr-1",
      command: "rm -rf /tmp/test",
    });
    const list = service.list();
    expect(list[0]!.activity).toBe("approval.requested");
    expect(list[0]!.level).toBe("warning");
    expect(list[0]!.body).toContain("rm -rf");
  });
});
