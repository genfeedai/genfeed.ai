export const APP_RAIL_FEATURE_FLAGS = {
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
 * What a per-user product flag resolves to without a PostHog answer: always in
 * Community, Desktop and self-hosted, and on SaaS when PostHog is absent or
 * silent with nothing cached (#5468). Unlisted keys are off. PostHog is the
 * only place a flag value changes — there is no env JSON of flag values.
 */
export const FEATURE_FLAG_OFFLINE_DEFAULTS: Readonly<Record<string, boolean>> =
  {
    [REPLY_BOT_FEATURE_FLAG]: true,
  };

/**
 * Desktop local/PGlite workspace. SaaS evaluates this in PostHog (fail closed).
 * Desktop/OSS shells without PostHog keep the local-mode slice available.
 */
export const DESKTOP_LOCAL_WORKSPACE_FEATURE_FLAG = 'desktop_local_workspace';

/**
 * Library canvas view. The PostHog key stays `moodboard` — the surface moved
 * from its own route to the Library's third view, the rollout did not.
 */
export const LIBRARY_CANVAS_FEATURE_FLAG = 'moodboard';

/** Low-credits banner in the protected shell. Evaluated in PostHog (#5468). */
export const LOW_CREDITS_BANNER_FEATURE_FLAG = 'low_credits_banner';

export type AppRailFeatureFlagApp = keyof typeof APP_RAIL_FEATURE_FLAGS;

export type AppRailFeatureFlagKey =
  (typeof APP_RAIL_FEATURE_FLAGS)[AppRailFeatureFlagApp];

export const APP_RAIL_FEATURE_FLAG_KEYS = Object.values(
  APP_RAIL_FEATURE_FLAGS,
) as AppRailFeatureFlagKey[];
