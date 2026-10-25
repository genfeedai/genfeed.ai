/**
 * How long a process may keep serving the last-read product feature switches
 * (#5407). Short enough that an operator change lands within seconds on every
 * process and before the next workers sweep tick, long enough that hot paths
 * cost one query per process per TTL.
 */
export const PLATFORM_FEATURE_SETTINGS_CACHE_TTL_MS = 15_000;

/**
 * Redis channel an API task publishes on after saving a margin change, so
 * every other task re-reads the singleton instead of serving the old multiplier
 * from process memory until its next deploy.
 */
export const PLATFORM_MARGIN_UPDATED_CHANNEL =
  'platform-settings:margin-updated';
