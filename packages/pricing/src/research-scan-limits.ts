/**
 * How often an organization may scan the two research libraries.
 *
 * A scan is one fresh collection that starts a scraper run: the niche keyword
 * search for one brand (trends), or one poll of one competitor (ads). Reading
 * what was already collected is never a scan. The plan sets how often an
 * organization may scan; it does not decide whether it may.
 *
 * The API enforces these numbers and the pricing page prints them, both from
 * here, so the page cannot promise a scan the API refuses.
 */
import {
  type ResearchScanLibrary,
  type ResearchScanLimitWindow,
  SubscriptionTier,
} from '@genfeedai/contracts';

export const RESEARCH_SCAN_LIBRARIES: readonly ResearchScanLibrary[] = [
  'trends',
  'ads',
];

/** Scans allowed inside one rolling window, per library. */
export type ResearchScanLimit = ResearchScanLimitWindow;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/**
 * Per-library scan limit by tier. `null` is unlimited. Exhaustive over
 * `SubscriptionTier`, so a new tier cannot ship without a scan limit.
 * Enterprise is the done-for-you tier.
 */
export const RESEARCH_SCAN_LIMITS: Record<
  SubscriptionTier,
  ResearchScanLimit | null
> = {
  [SubscriptionTier.FREE]: { maxScans: 1, windowMs: WEEK_MS },
  [SubscriptionTier.PRO]: { maxScans: 5, windowMs: DAY_MS },
  [SubscriptionTier.SCALE]: { maxScans: 25, windowMs: DAY_MS },
  [SubscriptionTier.ENTERPRISE]: null,
};

/**
 * Scan limit for a stored tier string. Unknown or empty tiers get the free
 * tier's limit, the same fallback the other tier entitlements use.
 */
export function getResearchScanLimitForTier(
  tier: string | null | undefined,
): ResearchScanLimit | null {
  if (tier && Object.hasOwn(RESEARCH_SCAN_LIMITS, tier)) {
    return RESEARCH_SCAN_LIMITS[tier as SubscriptionTier];
  }
  return RESEARCH_SCAN_LIMITS[SubscriptionTier.FREE];
}

/** "a week" or "a day": the window a limit counts in. */
function formatWindow(limit: ResearchScanLimit): string | null {
  if (limit.windowMs === WEEK_MS) return 'a week';
  if (limit.windowMs === DAY_MS) return 'a day';
  return null;
}

/** "1 a week", "5 a day", "Unlimited": the limit as the pricing page words it. */
export function formatResearchScanLimit(
  limit: ResearchScanLimit | null,
): string {
  if (limit === null) return 'Unlimited';
  const window = formatWindow(limit);
  if (window) return `${limit.maxScans} ${window}`;
  return `${limit.maxScans} per ${Math.round(limit.windowMs / 3_600_000)} hours`;
}

/**
 * What a tier's scans are, as one sentence for a plan card:
 * "1 trend scan and 1 competitor ad scan a week".
 */
export function describeResearchScans(tier: SubscriptionTier): string {
  const limit = RESEARCH_SCAN_LIMITS[tier];
  if (limit === null) return 'Unlimited trend and competitor ad scans';
  const noun = limit.maxScans === 1 ? 'scan' : 'scans';
  const window = formatWindow(limit);
  const count = `${limit.maxScans} trend ${noun} and ${limit.maxScans} competitor ad ${noun}`;
  return window
    ? `${count} ${window}`
    : `${count} per ${Math.round(limit.windowMs / 3_600_000)} hours`;
}
