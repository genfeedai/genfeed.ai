const DAY_MS = 86_400_000;

/**
 * Per-organization product-signal steps. They run as nodes of the lifecycle
 * email organization workflow (`lifecycle-email-maintenance-workflow.ts`).
 */
export const EMAIL_SIGNAL_ACTIONS = {
  GENERATIONS: 'email-product-signals.generations',
  CONVERSIONS: 'email-product-signals.conversions',
  RECEIPTS: 'email-product-signals.receipts',
} as const;

/** Checkpoint streams that record how far each signal has scanned. */
export const EMAIL_SIGNAL_STREAMS = {
  GENERATION: 'generation',
  RECEIPT: 'receipt',
} as const;

/** How far back a stream with no checkpoint yet looks. */
export const EMAIL_SIGNAL_DEFAULT_LOOKBACK_MS = DAY_MS;

/**
 * Attribution reads a seven-day outcome window over messages accepted up to
 * seven days before it, so a message accepted earlier than this can no longer
 * convert.
 */
export const EMAIL_CONVERSION_ACCEPTED_LOOKBACK_MS = 14 * DAY_MS;
