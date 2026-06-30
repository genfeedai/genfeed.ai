import { describe, expect, it } from 'vitest';
import {
  createConsentState,
  hasMarketingConsent,
  parseMarketingConsent,
} from './consent';

describe('marketing consent', () => {
  it('creates explicit granted or denied consent states', () => {
    expect(createConsentState('denied')).toMatchObject({
      adStorage: 'denied',
      analyticsStorage: 'denied',
    });
  });

  it('parses persisted consent only when values are valid', () => {
    expect(
      parseMarketingConsent(
        JSON.stringify({
          adStorage: 'granted',
          analyticsStorage: 'denied',
          updatedAt: '2026-05-03T00:00:00.000Z',
        }),
      ),
    ).toEqual({
      adStorage: 'granted',
      analyticsStorage: 'denied',
      updatedAt: '2026-05-03T00:00:00.000Z',
    });

    expect(parseMarketingConsent('{"adStorage":"maybe"}')).toBeNull();
    expect(parseMarketingConsent('not-json')).toBeNull();
  });

  it('requires ad storage consent before marketing tags can run', () => {
    expect(hasMarketingConsent(null)).toBe(false);
    expect(hasMarketingConsent(createConsentState('denied'))).toBe(false);
    expect(
      hasMarketingConsent({
        adStorage: 'denied',
        analyticsStorage: 'granted',
        updatedAt: '2026-05-03T00:00:00.000Z',
      }),
    ).toBe(false);
    expect(hasMarketingConsent(createConsentState('granted'))).toBe(true);
  });
});
