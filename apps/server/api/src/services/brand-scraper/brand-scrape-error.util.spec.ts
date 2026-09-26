import {
  BRAND_SCRAPE_EMPTY_CONTENT_WARNING,
  classifyBrandScrapeError,
  isBrandScrapeContentEmpty,
} from '@api/services/brand-scraper/brand-scrape-error.util';
import { BrandScrapeErrorCode } from '@genfeedai/contracts';
import type { IScrapedBrandData } from '@genfeedai/contracts/interfaces';

function emptyScrapedData(
  overrides: Partial<IScrapedBrandData> = {},
): IScrapedBrandData {
  return {
    scrapedAt: new Date(),
    sourceUrl: 'https://example.com',
    ...overrides,
  };
}

describe('classifyBrandScrapeError', () => {
  it('classifies an AbortController timeout', () => {
    const error = new Error('The operation was aborted');
    error.name = 'AbortError';

    expect(classifyBrandScrapeError(error)).toEqual({
      code: BrandScrapeErrorCode.TIMEOUT,
      message: 'The site took too long to respond.',
    });
  });

  it('classifies a message that says the request timed out', () => {
    expect(
      classifyBrandScrapeError(new Error('Request timed out after 10000ms')),
    ).toEqual({
      code: BrandScrapeErrorCode.TIMEOUT,
      message: 'The site took too long to respond.',
    });
  });

  it.each([
    'ENOTFOUND',
    'ECONNREFUSED',
    'ECONNRESET',
    'EAI_AGAIN',
    'EHOSTUNREACH',
    'ENETUNREACH',
  ])(
    'classifies transport code %s nested under .cause as unreachable',
    (code) => {
      const error = new TypeError('fetch failed');
      (error as unknown as { cause: { code: string } }).cause = { code };

      expect(classifyBrandScrapeError(error)).toEqual({
        code: BrandScrapeErrorCode.SITE_UNREACHABLE,
        message: 'We could not reach that website.',
      });
    },
  );

  it('classifies a directly-attached ENOTFOUND (no .cause wrapper) as unreachable', () => {
    const error = new Error('getaddrinfo ENOTFOUND example.com');
    (error as unknown as { code: string }).code = 'ENOTFOUND';

    expect(classifyBrandScrapeError(error)).toEqual({
      code: BrandScrapeErrorCode.SITE_UNREACHABLE,
      message: 'We could not reach that website.',
    });
  });

  it('classifies a DestinationGuardError private-address block as blocked', () => {
    const error = new Error(
      'Destination resolves to a private or reserved address: 10.0.0.1',
    );
    error.name = 'DestinationGuardError';

    expect(classifyBrandScrapeError(error)).toEqual({
      code: BrandScrapeErrorCode.SITE_BLOCKED,
      message: 'That website could not be accessed for scraping.',
    });
  });

  it('classifies a DestinationGuardError DNS failure as unreachable, not blocked', () => {
    const error = new Error('Destination hostname did not resolve: acme.test');
    error.name = 'DestinationGuardError';

    expect(classifyBrandScrapeError(error)).toEqual({
      code: BrandScrapeErrorCode.SITE_UNREACHABLE,
      message: 'We could not reach that website.',
    });
  });

  it('classifies exhausted 429 retries as blocked, not unknown', () => {
    expect(
      classifyBrandScrapeError(
        new Error('Max retries (3) exceeded for https://example.com'),
      ),
    ).toEqual({
      code: BrandScrapeErrorCode.SITE_BLOCKED,
      message: 'That website blocked our request to read it.',
    });
  });

  it.each([401, 403, 429, 999])(
    'classifies an embedded %s status as blocked',
    (status) => {
      expect(
        classifyBrandScrapeError(
          new Error(`Failed to fetch https://example.com: ${status} Forbidden`),
        ),
      ).toEqual({
        code: BrandScrapeErrorCode.SITE_BLOCKED,
        message: 'That website blocked our request to read it.',
      });
    },
  );

  it('classifies an embedded 5xx status as an upstream provider error', () => {
    expect(
      classifyBrandScrapeError(
        new Error(
          'Failed to fetch https://example.com: 503 Service Unavailable',
        ),
      ),
    ).toEqual({
      code: BrandScrapeErrorCode.UPSTREAM_PROVIDER_ERROR,
      message: 'That website is temporarily unavailable.',
    });
  });

  it('classifies an embedded 4xx (non-blocking) status as unreachable', () => {
    expect(
      classifyBrandScrapeError(
        new Error('Failed to fetch https://example.com: 404 Not Found'),
      ),
    ).toEqual({
      code: BrandScrapeErrorCode.SITE_UNREACHABLE,
      message: 'We could not reach that website.',
    });
  });

  it('reads the trailing status, not a 3-digit port in the URL (#5080 review)', () => {
    expect(
      classifyBrandScrapeError(
        new Error(
          'Failed to fetch https://example.com:800/path: 404 Not Found',
        ),
      ),
    ).toEqual({
      code: BrandScrapeErrorCode.SITE_UNREACHABLE,
      message: 'We could not reach that website.',
    });
  });

  it('reads the trailing status with no statusText (LinkedIn/X error shape)', () => {
    expect(
      classifyBrandScrapeError(new Error('Failed to fetch LinkedIn page: 403')),
    ).toEqual({
      code: BrandScrapeErrorCode.SITE_BLOCKED,
      message: 'That website blocked our request to read it.',
    });
  });

  it('classifies a bot-detection message without a status code as blocked', () => {
    expect(
      classifyBrandScrapeError(new Error('Please complete the captcha')),
    ).toEqual({
      code: BrandScrapeErrorCode.SITE_BLOCKED,
      message: 'That website blocked our request to read it.',
    });
  });

  it('falls back to UNKNOWN for an unrecognized failure', () => {
    expect(classifyBrandScrapeError(new Error('boom'))).toEqual({
      code: BrandScrapeErrorCode.UNKNOWN,
      message: 'We could not analyze that website.',
    });
  });

  it('falls back to UNKNOWN for a non-Error thrown value', () => {
    expect(classifyBrandScrapeError('boom')).toEqual({
      code: BrandScrapeErrorCode.UNKNOWN,
      message: 'We could not analyze that website.',
    });
  });
});

describe('isBrandScrapeContentEmpty', () => {
  it('is true when nothing analyzable was scraped', () => {
    expect(isBrandScrapeContentEmpty(emptyScrapedData())).toBe(true);
    expect(
      isBrandScrapeContentEmpty(
        emptyScrapedData({ companyName: '   ', valuePropositions: [] }),
      ),
    ).toBe(true);
  });

  it.each([
    { companyName: 'Acme' },
    { description: 'Widgets for the modern era' },
    { aboutText: 'We make widgets' },
    { heroText: 'Widgets, reimagined' },
    { tagline: 'Widgets done right' },
    { valuePropositions: ['Fast', 'Reliable'] },
  ] satisfies Partial<IScrapedBrandData>[])(
    'is false when %j is present',
    (overrides) => {
      expect(isBrandScrapeContentEmpty(emptyScrapedData(overrides))).toBe(
        false,
      );
    },
  );

  it('exposes a stable EMPTY_CONTENT warning constant', () => {
    expect(BRAND_SCRAPE_EMPTY_CONTENT_WARNING).toEqual({
      code: BrandScrapeErrorCode.EMPTY_CONTENT,
      message: "That website didn't have enough content for us to extract.",
    });
  });
});
