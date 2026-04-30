import type { OpenClawConfig } from "openclaw/plugin-sdk/config-types";

/**
 * Regex that matches Slack subteam (user-group) mention tokens.
 * Slack encodes them as `<!subteam^SXXXXXX>` or `<!subteam^SXXXXXX|@group-name>`.
 */
const SUBTEAM_MENTION_RE = /<!subteam\^([A-Z0-9]+)(?:\|[^>]*)?>/gi;

/**
 * Extract all Slack subteam IDs from a message text.
 * Returns an array of unique, uppercase subteam IDs.
 *
 * Example: `"<!subteam^S0B07LS458B> ping"` → `["S0B07LS458B"]`
 */
export function extractSlackSubteamMentionIds(text: string | undefined | null): string[] {
  if (!text) {
    return [];
  }
  const ids = new Set<string>();
  let match: RegExpExecArray | null;
  // Reset lastIndex since the regex is global
  SUBTEAM_MENTION_RE.lastIndex = 0;
  while ((match = SUBTEAM_MENTION_RE.exec(text)) !== null) {
    ids.add(match[1].toUpperCase());
  }
  return [...ids];
}

/**
 * Resolve the configured subteam mention allowlist for a given agent,
 * using presence-as-override semantics:
 * - If the agent defines `groupChat.subteamMentions` (even as `[]`), use it.
 * - Otherwise fall back to the global `messages.groupChat.subteamMentions`.
 * - If neither is configured, return `undefined` (feature not configured).
 */
function resolveSubteamMentions(
  cfg: OpenClawConfig,
  agentId: string | undefined,
): string[] | undefined {
  if (agentId) {
    const agentEntry = cfg.agents?.list?.find((a) => a.id === agentId);
    const agentGroupChat = agentEntry?.groupChat;
    if (agentGroupChat && Object.hasOwn(agentGroupChat, "subteamMentions")) {
      return agentGroupChat.subteamMentions ?? [];
    }
  }
  const globalGroupChat = cfg.messages?.groupChat;
  if (globalGroupChat && Object.hasOwn(globalGroupChat, "subteamMentions")) {
    return globalGroupChat.subteamMentions ?? [];
  }
  return undefined;
}

/**
 * Check whether any of the extracted subteam IDs match the agent's configured
 * allowlist. Returns `false` when the feature is not configured or the allowlist
 * is empty.
 */
export function matchesConfiguredSubteamMention(params: {
  subteamIds: string[];
  cfg: OpenClawConfig;
  agentId: string | undefined;
}): boolean {
  const { subteamIds, cfg, agentId } = params;
  if (subteamIds.length === 0) {
    return false;
  }
  const allowlist = resolveSubteamMentions(cfg, agentId);
  if (!allowlist || allowlist.length === 0) {
    return false;
  }
  const normalizedAllowlist = new Set(allowlist.map((id) => id.toUpperCase()));
  return subteamIds.some((id) => normalizedAllowlist.has(id));
}
