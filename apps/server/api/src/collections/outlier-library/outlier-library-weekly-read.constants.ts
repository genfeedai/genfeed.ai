import { Platform } from '@genfeedai/contracts';
import type { OutlierLibraryPlatform } from '@genfeedai/contracts/interfaces';

/**
 * Creators read per platform per week (#11642), kept here next to the other
 * plan numbers so a change is a reviewed commit and no environment variable.
 * When a cap is reached the oldest reads wait for the next week.
 *
 * - TikTok costs about $0.06 a creator (20 posts at $0.003); 100 creators is
 *   about $26 a month. The profile scraper has no run on the account yet:
 *   measure the first real runs before raising this.
 * - Instagram reads through Business Discovery on a Genfeed-owned professional
 *   account and costs nothing.
 * - YouTube is 0 until the Analytics & Reporting amendment (#11639) closes: a
 *   YouTube multiple is derived from API data and may not be stored before it.
 */
export const OUTLIER_WEEKLY_READ_CAPS: Readonly<
  Record<OutlierLibraryPlatform, number>
> = {
  [Platform.INSTAGRAM]: 200,
  [Platform.TIKTOK]: 100,
  [Platform.YOUTUBE]: 0,
};

/** The most posts one read asks for; also what the baseline looks back over. */
export const OUTLIER_READ_POST_LIMIT = 20;

/**
 * A claimed creator that is not completed within this long becomes claimable
 * again, so a worker that dies never loses a creator.
 */
export const OUTLIER_READ_CLAIM_LEASE_MS = 20 * 60 * 1000;

/**
 * The daily run reads at most a fifth of a platform's cap, so a week of runs
 * spreads the spend and a day that fails is made up on a later one.
 */
export const OUTLIER_DAILY_READ_SHARE = 5;

/** Name every scraper run of the weekly read carries in the run history. */
export const OUTLIER_WEEKLY_READ_APIFY_CALLER = 'outlier-library.weekly-read';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** 1970-01-05 was a Monday 00:00 UTC; weeks count from it. */
const FIRST_MONDAY_MS = Date.UTC(1970, 0, 5);

/** Monday 00:00 UTC of the week `now` falls in. */
export function startOfReadWeek(now: Date): Date {
  const weeks = Math.floor((now.getTime() - FIRST_MONDAY_MS) / WEEK_MS);
  return new Date(FIRST_MONDAY_MS + weeks * WEEK_MS);
}
