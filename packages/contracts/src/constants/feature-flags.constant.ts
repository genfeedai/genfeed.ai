/**
 * Product modules a superadmin can switch off for the whole platform from
 * Admin → Flags → Modules (#5468). Off hides the module's app-rail entry and
 * routes and answers its API with 404. Every module defaults on.
 */
export const PLATFORM_MODULE_FLAG_KEYS = [
  'agent',
  'studio',
  'library',
  'publishing',
  'messages',
  'reply_bot',
  'discovery',
  'analytics',
  'automation',
] as const;

/** Product features inside a module, switched from Admin → Flags → Features. */
export const PLATFORM_FEATURE_FLAG_KEYS = [
  'library_canvas',
  'low_credits_banner',
  'desktop_local_workspace',
] as const;

export type PlatformModuleFlagKey = (typeof PLATFORM_MODULE_FLAG_KEYS)[number];
export type PlatformFeatureFlagKey =
  (typeof PLATFORM_FEATURE_FLAG_KEYS)[number];
export type PlatformFlagKey = PlatformModuleFlagKey | PlatformFeatureFlagKey;

/** Same shape as `IPlatformFlags`, declared here so contracts stay acyclic. */
type PlatformFlagValues = Readonly<Record<PlatformFlagKey, boolean>>;

export const PLATFORM_FLAG_KEYS: readonly PlatformFlagKey[] = [
  ...PLATFORM_MODULE_FLAG_KEYS,
  ...PLATFORM_FEATURE_FLAG_KEYS,
];

/** Everything on: what a deployment gets until an operator switches a flag off. */
export const DEFAULT_PLATFORM_FLAGS: PlatformFlagValues = Object.freeze(
  Object.fromEntries(PLATFORM_FLAG_KEYS.map((key) => [key, true])) as Record<
    PlatformFlagKey,
    boolean
  >,
);

const PLATFORM_FLAG_KEY_SET = new Set<string>(PLATFORM_FLAG_KEYS);

export function isPlatformFlagKey(value: string): value is PlatformFlagKey {
  return PLATFORM_FLAG_KEY_SET.has(value);
}

/**
 * Narrow the persisted `flags` JSON. Only an explicit `false` turns a flag
 * off: a missing, unknown or malformed entry keeps the default (on), so a
 * flag added by a newer release is on until an operator says otherwise.
 */
export function parsePlatformFlags(value: unknown): PlatformFlagValues {
  const stored =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return Object.fromEntries(
    PLATFORM_FLAG_KEYS.map((key) => [key, stored[key] !== false]),
  ) as Record<PlatformFlagKey, boolean>;
}

/** App-rail entries and the module flag that shows them. */
export const APP_RAIL_FEATURE_FLAGS = {
  agent: 'agent',
  messages: 'messages',
  discovery: 'discovery',
  studio: 'studio',
  library: 'library',
  publishing: 'publishing',
  analytics: 'analytics',
  /** Merged workflows + automation surface. */
  automation: 'automation',
} as const satisfies Record<string, PlatformModuleFlagKey>;

/** Replies API + UI gate. */
export const REPLY_BOT_FEATURE_FLAG = 'reply_bot' satisfies PlatformFlagKey;

/** Desktop local/PGlite workspace entry on the login and desktop pages. */
export const DESKTOP_LOCAL_WORKSPACE_FEATURE_FLAG =
  'desktop_local_workspace' satisfies PlatformFlagKey;

/** Library canvas view (formerly the `moodboard` route). */
export const LIBRARY_CANVAS_FEATURE_FLAG =
  'library_canvas' satisfies PlatformFlagKey;

/** Low-credits banner in the protected shell. */
export const LOW_CREDITS_BANNER_FEATURE_FLAG =
  'low_credits_banner' satisfies PlatformFlagKey;

export type AppRailFeatureFlagApp = keyof typeof APP_RAIL_FEATURE_FLAGS;

export type AppRailFeatureFlagKey =
  (typeof APP_RAIL_FEATURE_FLAGS)[AppRailFeatureFlagApp];
