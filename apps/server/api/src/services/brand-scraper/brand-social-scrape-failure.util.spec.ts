import { reportSocialScrapeFailure } from '@api/services/brand-scraper/brand-social-scrape-failure.util';
import { describe, expect, it, vi } from 'vitest';

function createLogger() {
  return { error: vi.fn(), warn: vi.fn() };
}

describe('reportSocialScrapeFailure', () => {
  it.each([403, 429])(
    'logs a %s refusal as a warning with its status',
    (status) => {
      const logger = createLogger();

      reportSocialScrapeFailure(
        logger,
        'Scraper scrapeLinkedIn',
        Object.assign(new Error(`Failed to fetch LinkedIn page: ${status}`), {
          status,
        }),
        { url: 'https://linkedin.com/company/acme' },
      );

      expect(logger.warn).toHaveBeenCalledWith(
        'Scraper scrapeLinkedIn refused by the site',
        { status, url: 'https://linkedin.com/company/acme' },
      );
      expect(logger.error).not.toHaveBeenCalled();
    },
  );

  it.each([
    Object.assign(new Error('bad gateway'), { status: 502 }),
    new Error('ECONNREFUSED'),
    'boom',
    null,
  ])('logs %s as an error', (error) => {
    const logger = createLogger();

    reportSocialScrapeFailure(logger, 'Scraper scrapeXProfile', error);

    expect(logger.error).toHaveBeenCalledWith(
      'Scraper scrapeXProfile failed',
      error,
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
