export const APP_SWITCHER_FEATURE_FLAGS = {
  workspace: 'app_switcher_workspace',
  agent: 'app_switcher_agent',
  messages: 'app_switcher_messages',
  discovery: 'app_switcher_discover',
  studio: 'app_switcher_studio',
  library: 'app_switcher_library',
  /** Publishing surface — flag key kept as `app_switcher_posts` in PostHog. */
  publishing: 'app_switcher_posts',
  analytics: 'app_switcher_analytics',
  /** Merged workflows + automation surface. */
  automation: 'app_switcher_automate',
} as const;

/** Replies API + UI gate. SaaS evaluates this in PostHog; Community defaults on. */
export const REPLY_BOT_FEATURE_FLAG = 'reply_bot';

/**
 * Desktop local/PGlite workspace. SaaS evaluates this in PostHog (fail closed).
 * Desktop/OSS shells without PostHog keep the local-mode slice available.
 */
export const DESKTOP_LOCAL_WORKSPACE_FEATURE_FLAG = 'desktop_local_workspace';

export type AppSwitcherFeatureFlagApp = keyof typeof APP_SWITCHER_FEATURE_FLAGS;

export type AppSwitcherFeatureFlagKey =
  (typeof APP_SWITCHER_FEATURE_FLAGS)[AppSwitcherFeatureFlagApp];

export const APP_SWITCHER_FEATURE_FLAG_KEYS = Object.values(
  APP_SWITCHER_FEATURE_FLAGS,
) as AppSwitcherFeatureFlagKey[];
