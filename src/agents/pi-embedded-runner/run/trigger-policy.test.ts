import { describe, expect, it } from "vitest";
import { shouldInjectHeartbeatPromptForTrigger } from "./trigger-policy.js";

describe("shouldInjectHeartbeatPromptForTrigger", () => {
  it("injects the heartbeat prompt on heartbeat-triggered runs", () => {
    expect(shouldInjectHeartbeatPromptForTrigger("heartbeat")).toBe(true);
  });

  it.each([
    ["user"] as const,
    ["manual"] as const,
    ["cron"] as const,
    ["memory"] as const,
    ["overflow"] as const,
  ])("injects the heartbeat prompt on %s-triggered runs (default policy)", (trigger) => {
    expect(shouldInjectHeartbeatPromptForTrigger(trigger)).toBe(true);
  });

  it("injects the heartbeat prompt when no trigger is supplied (default policy)", () => {
    expect(shouldInjectHeartbeatPromptForTrigger(undefined)).toBe(true);
  });

  it("defaults to injecting heartbeat prompt to prevent empty content on new sessions (regression: #47)", () => {
    // Regression guard: changing this default to false causes MiniMax API error 2013
    // 'chat content is empty' on new sessions with non-heartbeat triggers.
    // See: https://github.com/yanbinwa/public-repo-openclaw/issues/47
    expect(shouldInjectHeartbeatPromptForTrigger("user")).toBe(true);
    expect(shouldInjectHeartbeatPromptForTrigger(undefined)).toBe(true);
  });
});
