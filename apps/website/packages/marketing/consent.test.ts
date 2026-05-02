import { describe, expect, it } from 'vitest';
import { createConsentState, parseMarketingConsent } from './consent';

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
});
