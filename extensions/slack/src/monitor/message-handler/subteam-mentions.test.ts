import type { OpenClawConfig } from "openclaw/plugin-sdk/config-types";
import { describe, expect, it } from "vitest";
import {
  extractSlackSubteamMentionIds,
  matchesConfiguredSubteamMention,
} from "./subteam-mentions.js";

describe("extractSlackSubteamMentionIds", () => {
  it("extracts a single subteam id", () => {
    expect(extractSlackSubteamMentionIds("<!subteam^S0B07LS458B> ping")).toEqual(["S0B07LS458B"]);
  });

  it("extracts multiple distinct subteam ids", () => {
    const text = "<!subteam^S0B07LS458B> and <!subteam^SOTHER123> hello";
    const ids = extractSlackSubteamMentionIds(text);
    expect(ids).toHaveLength(2);
    expect(ids).toContain("S0B07LS458B");
    expect(ids).toContain("SOTHER123");
  });

  it("deduplicates repeated ids", () => {
    const text = "<!subteam^S0B07LS458B> and <!subteam^S0B07LS458B> again";
    expect(extractSlackSubteamMentionIds(text)).toEqual(["S0B07LS458B"]);
  });

  it("normalizes ids to uppercase", () => {
    expect(extractSlackSubteamMentionIds("<!subteam^s0b07ls458b> hi")).toEqual(["S0B07LS458B"]);
  });

  it("handles subteam mention with display name suffix", () => {
    expect(extractSlackSubteamMentionIds("<!subteam^S0B07LS458B|@my-group> hi")).toEqual([
      "S0B07LS458B",
    ]);
  });

  it("returns empty array for no subteam mentions", () => {
    expect(extractSlackSubteamMentionIds("hello <@U123> world")).toEqual([]);
  });

  it("returns empty array for null/undefined/empty", () => {
    expect(extractSlackSubteamMentionIds(null)).toEqual([]);
    expect(extractSlackSubteamMentionIds(undefined)).toEqual([]);
    expect(extractSlackSubteamMentionIds("")).toEqual([]);
  });

  it("ignores malformed subteam tokens", () => {
    expect(extractSlackSubteamMentionIds("<!subteam> missing caret")).toEqual([]);
    expect(extractSlackSubteamMentionIds("<subteam^S123> missing bang")).toEqual([]);
  });
});

describe("matchesConfiguredSubteamMention", () => {
  const baseCfg: OpenClawConfig = {};

  it("returns false when no subteam ids in message", () => {
    const cfg: OpenClawConfig = {
      ...baseCfg,
      messages: { groupChat: { subteamMentions: ["S0B07LS458B"] } },
    };
    expect(matchesConfiguredSubteamMention({ subteamIds: [], cfg, agentId: undefined })).toBe(
      false,
    );
  });

  it("returns false when feature is not configured", () => {
    expect(
      matchesConfiguredSubteamMention({
        subteamIds: ["S0B07LS458B"],
        cfg: baseCfg,
        agentId: undefined,
      }),
    ).toBe(false);
  });

  it("matches against global subteamMentions", () => {
    const cfg: OpenClawConfig = {
      ...baseCfg,
      messages: { groupChat: { subteamMentions: ["S0B07LS458B"] } },
    };
    expect(
      matchesConfiguredSubteamMention({
        subteamIds: ["S0B07LS458B"],
        cfg,
        agentId: undefined,
      }),
    ).toBe(true);
  });

  it("does not match when subteam is not in allowlist", () => {
    const cfg: OpenClawConfig = {
      ...baseCfg,
      messages: { groupChat: { subteamMentions: ["S0B07LS458B"] } },
    };
    expect(
      matchesConfiguredSubteamMention({
        subteamIds: ["SOTHER"],
        cfg,
        agentId: undefined,
      }),
    ).toBe(false);
  });

  it("matches against per-agent subteamMentions", () => {
    const cfg: OpenClawConfig = {
      ...baseCfg,
      agents: {
        list: [{ id: "jack", groupChat: { subteamMentions: ["S0B07LS458B"] } }],
      },
    };
    expect(
      matchesConfiguredSubteamMention({
        subteamIds: ["S0B07LS458B"],
        cfg,
        agentId: "jack",
      }),
    ).toBe(true);
  });

  it("agent override shadows global (presence-as-override)", () => {
    const cfg: OpenClawConfig = {
      ...baseCfg,
      messages: { groupChat: { subteamMentions: ["S0B07LS458B"] } },
      agents: {
        list: [{ id: "jack", groupChat: { subteamMentions: ["SOTHER"] } }],
      },
    };
    // jack's list overrides global — S0B07LS458B is NOT in jack's list
    expect(
      matchesConfiguredSubteamMention({
        subteamIds: ["S0B07LS458B"],
        cfg,
        agentId: "jack",
      }),
    ).toBe(false);
    // SOTHER IS in jack's list
    expect(
      matchesConfiguredSubteamMention({
        subteamIds: ["SOTHER"],
        cfg,
        agentId: "jack",
      }),
    ).toBe(true);
  });

  it("explicit empty array on agent opts out even when global is set", () => {
    const cfg: OpenClawConfig = {
      ...baseCfg,
      messages: { groupChat: { subteamMentions: ["S0B07LS458B"] } },
      agents: {
        list: [{ id: "jack", groupChat: { subteamMentions: [] } }],
      },
    };
    expect(
      matchesConfiguredSubteamMention({
        subteamIds: ["S0B07LS458B"],
        cfg,
        agentId: "jack",
      }),
    ).toBe(false);
  });

  it("agent without groupChat falls back to global", () => {
    const cfg: OpenClawConfig = {
      ...baseCfg,
      messages: { groupChat: { subteamMentions: ["S0B07LS458B"] } },
      agents: {
        list: [{ id: "amanda" }],
      },
    };
    expect(
      matchesConfiguredSubteamMention({
        subteamIds: ["S0B07LS458B"],
        cfg,
        agentId: "amanda",
      }),
    ).toBe(true);
  });

  it("compares case-insensitively", () => {
    const cfg: OpenClawConfig = {
      ...baseCfg,
      messages: { groupChat: { subteamMentions: ["s0b07ls458b"] } },
    };
    expect(
      matchesConfiguredSubteamMention({
        subteamIds: ["S0B07LS458B"],
        cfg,
        agentId: undefined,
      }),
    ).toBe(true);
  });

  it("returns false when agentId is not in agents list", () => {
    const cfg: OpenClawConfig = {
      ...baseCfg,
      messages: { groupChat: { subteamMentions: ["S0B07LS458B"] } },
      agents: { list: [{ id: "other" }] },
    };
    // Falls back to global since agent not found
    expect(
      matchesConfiguredSubteamMention({
        subteamIds: ["S0B07LS458B"],
        cfg,
        agentId: "nonexistent",
      }),
    ).toBe(true);
  });
});
