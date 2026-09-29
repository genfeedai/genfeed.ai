import { BrandScrapeErrorCode } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import {
  extractBrandScrapeErrorCode,
  resolveBrandScrapeIssueCode,
  resolveScrapeIssueCodeFromError,
} from './brand-scrape-issue.util';

describe('extractBrandScrapeErrorCode', () => {
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
