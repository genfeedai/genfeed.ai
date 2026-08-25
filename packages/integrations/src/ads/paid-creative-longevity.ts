const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Days of continuous presentation after which longevity stops discriminating.
 * A creative that has survived a full quarter is already an evergreen winner;
 * ranking a two-year banner above it says more about the advertiser's account
 * hygiene than about the creative.
 */
export const PAID_CREATIVE_LONGEVITY_SATURATION_DAYS = 90;

/**
 * How much of the score a creative keeps once the advertiser stopped running
 * it. A halted ad still proves it survived its run, but a rival that is
 * *currently* paying to keep the same creative live is the stronger signal.
 */
const HALTED_SCORE_RETENTION = 0.6;

export interface PaidCreativeLongevityInput {
  isHalted?: boolean;
  presentationEndDate?: string;
  presentationStartDate?: string;
}

export interface PaidCreativeLongevity {
  /** Whole days the archive shows the creative on air. Never negative. */
  daysLive: number;
  /** Still presented at the observation instant. */
  isStillRunning: boolean;
  /** 0–100 persistence score. */
  score: number;
}

function readTimestamp(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);

  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Score how long a competitor kept paying to run a creative.
 *
 * Ad archives publish creative, not delivery: there is no CTR, spend, or ROAS
 * to rank a competitor's ad by, and inventing one would be worse than having
 * none. Run duration is the one performance signal the archives *do* disclose
 * honestly — advertisers retire losing creative quickly, so an ad that is
 * still live after months is evidence the advertiser is happy with it.
 *
 * The curve is logarithmic because the interesting distinction is "a few days
 * versus a few weeks", not "a year versus two". Reach is deliberately left
 * out: only Meta discloses it, and only for the EU, so folding it in would
 * make rows from different archives incomparable.
 *
 * Returns `null` — never `0` — when the archive published no usable start
 * date, matching the `performanceScore: null` contract for "unscored" as
 * opposed to "scored badly". `now` is injected so callers and tests share one
 * observation instant.
 */
export function resolvePaidCreativeLongevity(
  input: PaidCreativeLongevityInput,
  now: Date,
): PaidCreativeLongevity | null {
  const startedAt = readTimestamp(input.presentationStartDate);

  if (startedAt === null) {
    return null;
  }

  const observedAt = now.getTime();
  const endedAt = readTimestamp(input.presentationEndDate);
  // An end date in the future is a scheduled stop, not a finished run, so the
  // creative is measured up to today and still counts as live.
  const hasEnded = endedAt !== null && endedAt <= observedAt;
  const measuredUntil = hasEnded ? (endedAt as number) : observedAt;
  const isStillRunning = !hasEnded && input.isHalted !== true;
  const daysLive = Math.max(
    0,
    Math.floor((measuredUntil - startedAt) / MILLISECONDS_PER_DAY),
  );
  const duration = Math.min(
    1,
    Math.log10(daysLive + 1) /
      Math.log10(PAID_CREATIVE_LONGEVITY_SATURATION_DAYS + 1),
  );
  const score = Math.round(
    100 * duration * (isStillRunning ? 1 : HALTED_SCORE_RETENTION),
  );

  return { daysLive, isStillRunning, score };
}
