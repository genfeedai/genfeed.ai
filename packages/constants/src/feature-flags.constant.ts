export const APP_SWITCHER_FEATURE_FLAGS = {
  workspace: 'app_switcher_workspace',
  agent: 'app_switcher_agent',
  messages: 'app_switcher_messages',
  discover: 'app_switcher_discover',
  studio: 'app_switcher_studio',
  library: 'app_switcher_library',
  posts: 'app_switcher_posts',
  analytics: 'app_switcher_analytics',
  /** Merged workflows + automation surface. */
  automate: 'app_switcher_automate',
} as const;

export type AppSwitcherFeatureFlagApp = keyof typeof APP_SWITCHER_FEATURE_FLAGS;

export type AppSwitcherFeatureFlagKey =
  (typeof APP_SWITCHER_FEATURE_FLAGS)[AppSwitcherFeatureFlagApp];

export const APP_SWITCHER_FEATURE_FLAG_KEYS = Object.values(
  APP_SWITCHER_FEATURE_FLAGS,
) as AppSwitcherFeatureFlagKey[];
