/**
 * What Crun charges us, as recorded on hosted quotes. Crun bills in its own
 * credits; this converts them to the dollar cost that feeds margin and the
 * vendor-cost ledger. Source: the base credit pack on Crun's pricing page
 * (US$1 = 200 Crun credits, larger packs are cheaper, so this overstates cost).
 * Customer-facing credits are unrelated: 1 Genfeed credit = $0.01.
 */
export const CRUN_CREDITS_PER_USD = '200';

/**
 * Stamped on a quote when it is frozen; a quote frozen under another value is
 * stale. Bump it whenever CRUN_CREDITS_PER_USD changes.
 */
export const CRUN_ACQUISITION_RATE_VERSION = '2026-10-24';
