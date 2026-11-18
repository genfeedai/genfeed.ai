import type { LoggerService } from '@libs/logger/logger.service';

/**
 * LinkedIn and X refuse anonymous page fetches (403, 429) as a matter of
 * course, and callers fall back without the profile. A refusal is logged as a
 * warning; only a failure that is not the site turning us away is an error.
 */
export function reportSocialScrapeFailure(
  logger: Pick<LoggerService, 'error' | 'warn'>,
  caller: string,
  error: unknown,
  context?: { url: string },
): void {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    logger.warn(`${caller} refused by the site`, { ...context, status });
    return;
  }
  if (context) {
    logger.error(`${caller} failed`, error, context);
  } else {
    logger.error(`${caller} failed`, error);
  }
}
