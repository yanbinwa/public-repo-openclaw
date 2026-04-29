import { describe, expect, it } from "vitest";
import { extractNotificationText, mapEventToCategory } from "./notification-service.js";

describe("mapEventToCategory", () => {
  it("maps chat events to chat category", () => {
    expect(mapEventToCategory("chat")).toBe("chat");
    expect(mapEventToCategory("chat.side_result")).toBe("chat");
  });

  it("maps agent event to agent category", () => {
    expect(mapEventToCategory("agent")).toBe("agent");
  });

  it("maps session events to session category", () => {
    expect(mapEventToCategory("session.message")).toBe("session");
    expect(mapEventToCategory("session.tool")).toBe("session");
    expect(mapEventToCategory("sessions.changed")).toBe("session");
  });

  it("maps approval events to approval category", () => {
    expect(mapEventToCategory("exec.approval.requested")).toBe("approval");
    expect(mapEventToCategory("exec.approval.resolved")).toBe("approval");
    expect(mapEventToCategory("plugin.approval.requested")).toBe("approval");
    expect(mapEventToCategory("plugin.approval.resolved")).toBe("approval");
  });

  it("maps cron event to cron category", () => {
    expect(mapEventToCategory("cron")).toBe("cron");
  });

  it("returns undefined for unmapped events", () => {
    expect(mapEventToCategory("presence")).toBeUndefined();
    expect(mapEventToCategory("tick")).toBeUndefined();
    expect(mapEventToCategory("shutdown")).toBeUndefined();
    expect(mapEventToCategory("health")).toBeUndefined();
  });
});

describe("extractNotificationText", () => {
  it("extracts text from chat event", () => {
    const result = extractNotificationText("chat", { text: "Hello world" });
    expect(result.title).toBe("New message");
    expect(result.body).toBe("Hello world");
  });

  it("extracts text from agent event", () => {
    const result = extractNotificationText("agent", { event: "tool_use" });
    expect(result.title).toBe("Agent activity");
    expect(result.body).toBe("tool_use");
  });

  it("extracts text from approval event", () => {
    const result = extractNotificationText("exec.approval.requested", {
      description: "Allow file write",
    });
    expect(result.title).toBe("Approval requested");
    expect(result.body).toBe("Allow file write");
  });

  it("truncates long body text", () => {
    const longText = "a".repeat(200);
    const result = extractNotificationText("chat", { text: longText });
    expect(result.body!.length).toBeLessThanOrEqual(120);
    expect(result.body!.endsWith("\u2026")).toBe(true);
  });

  it("returns generic title for unmapped events", () => {
    const result = extractNotificationText("presence", {});
    expect(result.title).toBe("OpenClaw notification");
    expect(result.body).toBeUndefined();
  });

  it("handles missing payload gracefully", () => {
    const result = extractNotificationText("chat", null);
    expect(result.title).toBe("New message");
    expect(result.body).toBeUndefined();
  });
});
