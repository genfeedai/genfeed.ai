/**
 * What Crun charges us, as recorded on hosted quotes. Crun bills in its own
 * credits; this converts them to the dollar cost that feeds margin and the
 * vendor-cost ledger. Source: https://crun.ai/pricing, checked 2026-10-24:
 * 200 / 206 / 212 / 224 credits per US$ on the $5 / $50 / $500 / $1250 plans.
 * The base rate is used, so larger plans make this overstate cost.
 * Customer-facing credits are unrelated: 1 Genfeed credit = $0.01.
 */
export const CRUN_CREDITS_PER_USD = '200';

/**
 * Stamped on a quote when it is frozen; a quote frozen under another value is
 * stale. Bump it whenever CRUN_CREDITS_PER_USD changes.
 */
export const CRUN_ACQUISITION_RATE_VERSION = '2026-10-24';
