import { BrandScrapeErrorCode } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import {
  extractBrandScrapeErrorCode,
  resolveBrandScrapeIssueCode,
  resolveScrapeIssueCodeFromError,
} from './brand-scrape-issue.util';

describe('extractBrandScrapeErrorCode', () => {
  it('reads the code from a JSON:API error body', () => {
    expect(
      extractBrandScrapeErrorCode({
        errors: [{ code: 'BRAND_SCRAPE_TIMEOUT', detail: 'x', title: 'x' }],
      }),
    ).toBe('BRAND_SCRAPE_TIMEOUT');
  });

  it.each([
    undefined,
    null,
    'plain string error',
    new Error('network down'),
    { errors: [] },
    { errors: [{ detail: 'no code here' }] },
  ])('returns undefined for %p', (value) => {
    expect(extractBrandScrapeErrorCode(value)).toBeUndefined();
  });
});

describe('resolveBrandScrapeIssueCode', () => {
  it.each(Object.values(BrandScrapeErrorCode))(
    'passes a known code %s through unchanged',
    (code) => {
      expect(resolveBrandScrapeIssueCode(code)).toBe(code);
    },
  );

  it.each([undefined, 'SOMETHING_NOT_IN_THE_ENUM', ''])(
    'falls back to UNKNOWN for %p',
    (code) => {
      expect(resolveBrandScrapeIssueCode(code)).toBe(
        BrandScrapeErrorCode.UNKNOWN,
      );
    },
  );
});

describe('resolveScrapeIssueCodeFromError', () => {
  it('prefers the server JSON:API code when present', () => {
    expect(
      resolveScrapeIssueCodeFromError({
        errors: [
          { code: 'BRAND_SCRAPE_SITE_BLOCKED', detail: 'x', title: 'x' },
        ],
      }),
    ).toBe(BrandScrapeErrorCode.SITE_BLOCKED);
  });

  it('resolves a client-side interceptor timeout (no JSON:API body) to TIMEOUT', () => {
    const timeoutError = Object.assign(new Error('Request timed out.'), {
      isTimeout: true,
    });
    expect(resolveScrapeIssueCodeFromError(timeoutError)).toBe(
      BrandScrapeErrorCode.TIMEOUT,
    );
  });

  it.each([undefined, null, new Error('network down'), 'plain string'])(
    'falls back to UNKNOWN for %p',
    (error) => {
      expect(resolveScrapeIssueCodeFromError(error)).toBe(
        BrandScrapeErrorCode.UNKNOWN,
      );
    },
  );
});
