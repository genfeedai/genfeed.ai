import type { RateLimitOptions } from '@api/shared/decorators/rate-limit/rate-limit.decorator';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Every run of a free public tool pays for transcription from a shared
 * platform organization, and a per-IP limit does not bound that bill: many
 * addresses together can still run it up. These windows count all callers of
 * an endpoint together, so a day's spend has a ceiling.
 *
 * The numbers are a starting budget, not a measured one: the transcription
 * price per run is not in the repository. Raise or lower them once a real day
 * of spend has been read.
 */
export const PUBLIC_YOUTUBE_LONG_FORM_DAILY_RUNS = 200;
export const PUBLIC_YOUTUBE_CLIPPER_DAILY_RUNS = 100;

export function publicToolDailyLimit(
  limit: number,
  tool: string,
): RateLimitOptions {
  return {
    limit,
    message: `The free ${tool} has reached its limit for today. Please try again tomorrow, or sign up to run it from your own workspace.`,
    scope: 'global',
    windowMs: ONE_DAY_MS,
  };
}
