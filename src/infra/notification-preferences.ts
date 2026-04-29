import path from "node:path";
import { resolveStateDir } from "../config/paths.js";
import {
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
  type NotificationPreferences,
} from "../gateway/protocol/schema/notifications.js";
import { createAsyncLock, readJsonFile, writeJsonAtomic } from "./json-files.js";

// --- Types ---

export type NotificationPreferencesState = {
  /** Global preferences (apply to all subscriptions unless overridden). */
  global: NotificationPreferences;
  /** Per-subscription overrides keyed by subscriptionId. */
  bySubscription: Record<string, NotificationPreferences>;
};

// --- Constants ---

const PREFERENCES_FILENAME = "push/notification-preferences.json";

const withLock = createAsyncLock();

// --- Helpers ---

function resolvePreferencesPath(baseDir?: string): string {
  const root = baseDir ?? resolveStateDir();
  return path.join(root, PREFERENCES_FILENAME);
}

function defaultPreferences(): NotificationPreferences {
  return {
    enabledCategories: [...NOTIFICATION_CATEGORIES],
    muted: false,
    updatedAtMs: Date.now(),
  };
}

function defaultState(): NotificationPreferencesState {
  return {
    global: defaultPreferences(),
    bySubscription: {},
  };
}

// --- State persistence ---

async function loadState(baseDir?: string): Promise<NotificationPreferencesState> {
  const filePath = resolvePreferencesPath(baseDir);
  const state = await readJsonFile<NotificationPreferencesState>(filePath);
  return state ?? defaultState();
}

async function persistState(state: NotificationPreferencesState, baseDir?: string): Promise<void> {
  const filePath = resolvePreferencesPath(baseDir);
  await writeJsonAtomic(filePath, state, { trailingNewline: true });
}

// --- Public API ---

/**
 * Get notification preferences. If subscriptionId is provided, returns
 * per-subscription preferences (falling back to global). Otherwise
 * returns global preferences.
 */
export async function getNotificationPreferences(
  subscriptionId?: string,
  baseDir?: string,
): Promise<NotificationPreferences> {
  const state = await loadState(baseDir);
  if (subscriptionId && state.bySubscription[subscriptionId]) {
    return state.bySubscription[subscriptionId];
  }
  return state.global;
}

/**
 * Update notification preferences. If subscriptionId is provided, updates
 * per-subscription preferences. Otherwise updates global preferences.
 */
export async function setNotificationPreferences(
  params: {
    subscriptionId?: string;
    enabledCategories?: NotificationCategory[];
    muted?: boolean;
  },
  baseDir?: string,
): Promise<NotificationPreferences> {
  return await withLock(async () => {
    const state = await loadState(baseDir);
    const target = params.subscriptionId
      ? (state.bySubscription[params.subscriptionId] ??= defaultPreferences())
      : state.global;

    if (params.enabledCategories !== undefined) {
      // Validate all categories
      const valid = params.enabledCategories.every((c) =>
        (NOTIFICATION_CATEGORIES as readonly string[]).includes(c),
      );
      if (!valid) {
        throw new Error("invalid notification category");
      }
      target.enabledCategories = params.enabledCategories;
    }

    if (params.muted !== undefined) {
      target.muted = params.muted;
    }

    target.updatedAtMs = Date.now();
    await persistState(state, baseDir);
    return target;
  });
}

/**
 * Check whether a notification category is enabled for a given subscription.
 * Falls back to global preferences if no per-subscription override exists.
 */
export async function isCategoryEnabled(
  category: NotificationCategory,
  subscriptionId?: string,
  baseDir?: string,
): Promise<boolean> {
  const prefs = await getNotificationPreferences(subscriptionId, baseDir);
  if (prefs.muted) {
    return false;
  }
  return prefs.enabledCategories.includes(category);
}
