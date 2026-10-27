/** Share of a retry's price returned as credits (#7730). */
export const RETRY_CREDIT_BACK_RATE = 0.25;

/** A retry earns credit back when the same brief was generated this recently. */
export const RETRY_CREDIT_BACK_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Most credit a user can earn back per rolling window, across all briefs. */
export const RETRY_CREDIT_BACK_DAILY_CAP_CREDITS = 200;

/** Credit-back is spendable for this long, so it costs COGS only if used. */
export const RETRY_CREDIT_BACK_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

/** Ledger source and reference type of a retry credit-back grant. */
export const RETRY_CREDIT_BACK_SOURCE = 'retry-credit-back';
