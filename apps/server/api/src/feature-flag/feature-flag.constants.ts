/**
 * How long a process may keep serving the last-read platform feature flags
 * (#5407, #5468). Short enough that a PostHog flag edit lands within seconds
 * on every process and before the next workers sweep tick, long enough that
 * hot paths cost one PostHog request per process per TTL.
 */
export const PLATFORM_FEATURE_SETTINGS_CACHE_TTL_MS = 15_000;
