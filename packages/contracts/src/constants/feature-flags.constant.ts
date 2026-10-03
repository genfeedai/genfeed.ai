/**
 * Product modules a superadmin can switch off for the whole platform from
 * Admin → Flags (#5468). Off hides the module's app-rail entry and
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

/**
 * Studio surfaces, each switchable on its own under the `studio` module. Off
 * hides the Studio nav entry and its routes; surfaces with their own API also
 * answer 404. Generate is the Studio home, so it follows the module itself.
 */
export const PLATFORM_STUDIO_FLAG_KEYS = [
  'studio_motion',
  'studio_storyboard',
  'studio_clips',
  'studio_batch',
  'studio_editor',
] as const;

/** Product features, switched from Admin → Flags. */
export const PLATFORM_FEATURE_FLAG_KEYS = [
  'library_canvas',
  'low_credits_banner',
  'desktop_local_workspace',
  'batch_ideas',
] as const;

export type PlatformModuleFlagKey = (typeof PLATFORM_MODULE_FLAG_KEYS)[number];
export type PlatformStudioFlagKey = (typeof PLATFORM_STUDIO_FLAG_KEYS)[number];
export type PlatformFeatureFlagKey =
  (typeof PLATFORM_FEATURE_FLAG_KEYS)[number];
export type PlatformFlagKey =
  | PlatformModuleFlagKey
  | PlatformStudioFlagKey
  | PlatformFeatureFlagKey;

/** Same shape as `IPlatformFlags`, declared here so contracts stay acyclic. */
type PlatformFlagValues = Readonly<Record<PlatformFlagKey, boolean>>;

export const PLATFORM_FLAG_KEYS: readonly PlatformFlagKey[] = [
  ...PLATFORM_MODULE_FLAG_KEYS,
  ...PLATFORM_STUDIO_FLAG_KEYS,
  ...PLATFORM_FEATURE_FLAG_KEYS,
];

/**
 * The flag each nested flag lives under. A flag is only in effect while its
 * whole parent chain is on: switching Studio off turns off every Studio
 * surface without touching their own stored switches. Unlisted flags are
 * top level.
 */
export const PLATFORM_FLAG_PARENTS: Readonly<
  Partial<Record<PlatformFlagKey, PlatformFlagKey>>
> = {
  batch_ideas: 'studio_batch',
  library_canvas: 'library',
  reply_bot: 'messages',
  studio_batch: 'studio',
  studio_clips: 'studio',
  studio_editor: 'studio',
  studio_motion: 'studio',
  studio_storyboard: 'studio',
};

/** Direct children of `parent`, in `PLATFORM_FLAG_KEYS` order. */
export function getPlatformFlagChildren(
  parent: PlatformFlagKey,
): PlatformFlagKey[] {
  return PLATFORM_FLAG_KEYS.filter(
    (key) => PLATFORM_FLAG_PARENTS[key] === parent,
  );
}

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

/**
 * The flags in effect: a flag is on only while it and every flag above it in
 * `PLATFORM_FLAG_PARENTS` are on. Stored switches stay as the operator left
 * them; this is what the API guard and the app shells read.
 */
export function resolvePlatformFlags(
  flags: PlatformFlagValues,
): PlatformFlagValues {
  const isInEffect = (key: PlatformFlagKey): boolean => {
    const parent = PLATFORM_FLAG_PARENTS[key];
    return flags[key] && (parent === undefined || isInEffect(parent));
  };

  return Object.fromEntries(
    PLATFORM_FLAG_KEYS.map((key) => [key, isInEffect(key)]),
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

/** Batch idea projects (brand data → content ideas) in Studio batches (#5463). */
export const BATCH_IDEAS_FEATURE_FLAG = 'batch_ideas' satisfies PlatformFlagKey;

/**
 * Apps that start in the rail's More menu. A user can pin these onto the
 * rail; the daily loop is always visible and is not pinnable.
 */
export const PINNABLE_APP_IDS = [
  'studio',
  'automation',
  'messages',
  'discovery',
] as const;

export type PinnableAppId = (typeof PINNABLE_APP_IDS)[number];

export function isPinnableAppId(value: string): value is PinnableAppId {
  return (PINNABLE_APP_IDS as readonly string[]).includes(value);
}

export type AppRailFeatureFlagApp = keyof typeof APP_RAIL_FEATURE_FLAGS;

export type AppRailFeatureFlagKey =
  (typeof APP_RAIL_FEATURE_FLAGS)[AppRailFeatureFlagApp];
