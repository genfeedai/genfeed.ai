/**
 * Free-trial expiry sweep. Admission already refuses a never-paid
 * organization the moment its trial ends, so the sweep only has to remove the
 * leftover free credits; every 15 minutes keeps the balance the app shows
 * close to that moment without scanning wallets every minute.
 */
export const FREE_TRIAL_EXPIRY_INTERVAL_MINUTES = 15;
export const FREE_TRIAL_EXPIRY_SCHEDULE = `*/${FREE_TRIAL_EXPIRY_INTERVAL_MINUTES} * * * *`;

/** Held for less than one interval so a crashed sweep never skips two ticks. */
export const FREE_TRIAL_EXPIRY_LOCK_KEY = 'free-trial-expiry:sweep';
export const FREE_TRIAL_EXPIRY_LOCK_TTL_SECONDS =
  FREE_TRIAL_EXPIRY_INTERVAL_MINUTES * 60 - 60;

/** Wallets read per page while discovering expired trials. */
export const FREE_TRIAL_EXPIRY_PAGE_SIZE = 100;
