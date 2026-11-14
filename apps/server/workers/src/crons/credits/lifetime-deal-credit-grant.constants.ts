/**
 * Monthly credits of the lifetime-deal seats. A grant falls due once a month
 * per seat, so an hourly sweep lands it within the hour without scanning the
 * seats every minute.
 */
export const LIFETIME_DEAL_CREDIT_GRANT_INTERVAL_MINUTES = 60;
export const LIFETIME_DEAL_CREDIT_GRANT_SCHEDULE = '0 * * * *';

/** Held for less than one interval so a crashed sweep never skips two ticks. */
export const LIFETIME_DEAL_CREDIT_GRANT_LOCK_KEY =
  'lifetime-deal-credit-grant:sweep';
export const LIFETIME_DEAL_CREDIT_GRANT_LOCK_TTL_SECONDS =
  LIFETIME_DEAL_CREDIT_GRANT_INTERVAL_MINUTES * 60 - 60;

/** Seats read per page while discovering due grants. */
export const LIFETIME_DEAL_CREDIT_GRANT_PAGE_SIZE = 100;
