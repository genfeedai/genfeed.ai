/**
 * Paid creator subscription renewals (#9717). Periods are a month long, so a
 * 15-minute cadence charges a renewal close to its period end without
 * scanning every minute.
 */
export const CREATOR_SUBSCRIPTION_RENEWAL_INTERVAL_MINUTES = 15;
export const CREATOR_SUBSCRIPTION_RENEWAL_SCHEDULE = `*/${CREATOR_SUBSCRIPTION_RENEWAL_INTERVAL_MINUTES} * * * *`;

/** Held for less than one interval so a crashed sweep never skips two ticks. */
export const CREATOR_SUBSCRIPTION_RENEWAL_LOCK_KEY =
  'creator-subscription-renewal:sweep';
export const CREATOR_SUBSCRIPTION_RENEWAL_LOCK_TTL_SECONDS =
  CREATOR_SUBSCRIPTION_RENEWAL_INTERVAL_MINUTES * 60 - 60;

/** Creator organizations read per page while discovering due renewals. */
export const CREATOR_SUBSCRIPTION_RENEWAL_PAGE_SIZE = 100;
