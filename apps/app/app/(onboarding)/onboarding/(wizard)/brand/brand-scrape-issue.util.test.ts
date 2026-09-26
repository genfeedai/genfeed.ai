import { BrandScrapeErrorCode } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import {
  extractBrandScrapeErrorCode,
  resolveBrandScrapeIssueCode,
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
