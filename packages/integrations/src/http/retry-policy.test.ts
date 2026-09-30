import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INTEGRATION_RETRY_CONFIG,
  getIntegrationRetryDelayMs,
  isRetryableIntegrationStatus,
  parseIntegrationRetryAfterMs,
} from './retry-policy';

describe('isRetryableIntegrationStatus', () => {
  it('retries the default provider status set and nothing else', () => {
    for (const status of DEFAULT_INTEGRATION_RETRY_CONFIG.retryableStatusCodes) {
      expect(isRetryableIntegrationStatus(status)).toBe(true);
    }

    expect(isRetryableIntegrationStatus(200)).toBe(false);
    expect(isRetryableIntegrationStatus(401)).toBe(false);
    expect(
      isRetryableIntegrationStatus(429, {
        ...DEFAULT_INTEGRATION_RETRY_CONFIG,
        retryableStatusCodes: [503],
      }),
    ).toBe(false);
  });
});

describe('parseIntegrationRetryAfterMs', () => {
  const now = new Date('2026-08-14T12:00:00.000Z');

  it('treats a bare number as relative seconds', () => {
    expect(parseIntegrationRetryAfterMs('2', now)).toBe(2000);
    expect(parseIntegrationRetryAfterMs('0', now)).toBe(0);
  });

  it('converts epoch reset headers to a remaining delay', () => {
    expect(
      parseIntegrationRetryAfterMs('1786708860', now, 'x-rate-limit-reset'),
    ).toBe(Math.max(0, 1_786_708_860_000 - now.getTime()));
    expect(parseIntegrationRetryAfterMs('1', now, 'X-Rate-Limit-Reset')).toBe(
      0,
    );
  });

  it('parses HTTP-date retry-after values and rejects junk', () => {
    expect(
      parseIntegrationRetryAfterMs('Fri, 14 Aug 2026 12:00:03 GMT', now),
    ).toBe(3000);
    expect(parseIntegrationRetryAfterMs('not-a-delay', now)).toBeUndefined();
    expect(parseIntegrationRetryAfterMs(null, now)).toBeUndefined();
  });
});

describe('getIntegrationRetryDelayMs', () => {
  it('prefers the first configured retry-after header', () => {
    const headers = new Headers({
      'retry-after': '4',
      'x-rate-limit-reset': '1',
    });

    expect(
      getIntegrationRetryDelayMs({
        attempt: 3,
        headers,
      }),
    ).toBe(4000);
  });

  it('falls back to exponential base delay when no header is present', () => {
    expect(getIntegrationRetryDelayMs({ attempt: 1 })).toBe(500);
    expect(getIntegrationRetryDelayMs({ attempt: 2 })).toBe(1000);
    expect(getIntegrationRetryDelayMs({ attempt: 3 })).toBe(2000);
    expect(getIntegrationRetryDelayMs({ attempt: 0 })).toBe(500);
  });
});
