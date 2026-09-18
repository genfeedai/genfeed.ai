/** CreditReservation.workloadType for Director live sessions (#4611). */
export const LIVE_SESSION_WORKLOAD_TYPE = 'live-session';

/**
 * Fal H3 Max Director bills a 60-second session minimum and caps public
 * sessions at 15 minutes. The ceiling is the reserved quantity, not a plan
 * tier.
 */
export const LIVE_SESSION_MIN_CEILING_SECONDS = 60;
export const LIVE_SESSION_MAX_CEILING_SECONDS = 900;
export const LIVE_SESSION_DEFAULT_CEILING_SECONDS = 900;
export const LIVE_SESSION_CEILING_OPTIONS = [
  60, 120, 180, 300, 600, 900,
] as const;
