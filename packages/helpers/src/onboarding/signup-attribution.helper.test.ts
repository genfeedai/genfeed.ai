import { describe, expect, it } from 'vitest';

import {
  appendSignupAttributionParams,
  hasSignupAttribution,
  normalizeSignupAttributionValue,
  normalizeSignupLandingPath,
  readSignupAttributionParams,
  resolveExternalReferrerDomain,
  toSignupAttributionParams,
} from './signup-attribution.helper';

describe('normalizeSignupAttributionValue', () => {
  it('trims, collapses whitespace and lowercases', () => {
    expect(normalizeSignupAttributionValue('  Product  Hunt ')).toBe(
      'product hunt',
    );
  });

  it('rejects markup, control characters and oversized values', () => {
    expect(normalizeSignupAttributionValue('<script>')).toBeUndefined();
    expect(normalizeSignupAttributionValue('a\u0000b')).toBeUndefined();
    expect(normalizeSignupAttributionValue('x'.repeat(101))).toBeUndefined();
    expect(normalizeSignupAttributionValue('')).toBeUndefined();
  });

  it('rejects URL-shaped values', () => {
    expect(
      normalizeSignupAttributionValue('https://example.com/private/customer-1'),
    ).toBeUndefined();
    expect(
      normalizeSignupAttributionValue('example.com/private'),
    ).toBeUndefined();
  });
});

describe('normalizeSignupLandingPath', () => {
  it('keeps the path and drops the query string and fragment', () => {
    expect(normalizeSignupLandingPath('/use-cases/creators?email=a#top')).toBe(
      '/use-cases/creators',
    );
  });

  it('rejects anything that is not a relative path', () => {
    expect(normalizeSignupLandingPath('https://evil.test/')).toBeUndefined();
    expect(normalizeSignupLandingPath('studio')).toBeUndefined();
    expect(
      normalizeSignupLandingPath('//example.com/private/customer-1'),
    ).toBeUndefined();
    expect(normalizeSignupLandingPath('/a//b')).toBeUndefined();
  });
});

describe('resolveExternalReferrerDomain', () => {
  it('returns the external referring domain without www', () => {
    expect(
      resolveExternalReferrerDomain('https://www.google.com/', 'genfeed.ai'),
    ).toBe('google.com');
  });

  it('treats the same site and sibling subdomains as internal', () => {
    expect(
      resolveExternalReferrerDomain('https://genfeed.ai/pricing', 'genfeed.ai'),
    ).toBeUndefined();
    expect(
      resolveExternalReferrerDomain('https://genfeed.ai/', 'app.genfeed.ai'),
    ).toBeUndefined();
    expect(
      resolveExternalReferrerDomain(
        'https://docs.genfeed.ai/',
        'app.genfeed.ai',
      ),
    ).toBeUndefined();
  });

  it('returns undefined for an empty referrer', () => {
    expect(resolveExternalReferrerDomain('', 'genfeed.ai')).toBeUndefined();
  });
});

describe('readSignupAttributionParams', () => {
  it('reads UTM tags, referrer and landing path from a sign-up URL', () => {
    const params = new URLSearchParams(
      'utm_source=ChatGPT&utm_medium=referral&utm_term=secret+search&signup_referrer=chatgpt.com&signup_landing=%2Fstudio',
    );

    expect(readSignupAttributionParams(params)).toEqual({
      landingPath: '/studio',
      referrerDomain: 'chatgpt.com',
      utmMedium: 'referral',
      utmSource: 'chatgpt',
    });
  });

  it('returns an empty attribution when nothing is carried', () => {
    const attribution = readSignupAttributionParams(
      new URLSearchParams('plan=payg'),
    );

    expect(attribution).toEqual({});
    expect(hasSignupAttribution(attribution)).toBe(false);
  });
});

describe('appendSignupAttributionParams', () => {
  it('adds attribution without overriding the link’s own UTM tags', () => {
    const url = new URL(
      'https://app.genfeed.ai/sign-up?plan=payg&utm_source=newsletter',
    );

    appendSignupAttributionParams(url, {
      landingPath: '/pricing',
      referrerDomain: 'google.com',
      utmSource: 'google',
    });

    expect(url.searchParams.get('utm_source')).toBe('newsletter');
    expect(url.searchParams.get('signup_referrer')).toBe('google.com');
    expect(url.searchParams.get('signup_landing')).toBe('/pricing');
    expect(url.searchParams.get('plan')).toBe('payg');
  });
});

describe('toSignupAttributionParams', () => {
  it('round-trips through readSignupAttributionParams', () => {
    const attribution = {
      landingPath: '/studio',
      referrerDomain: 'chatgpt.com',
      utmSource: 'chatgpt',
    };

    expect(
      readSignupAttributionParams(toSignupAttributionParams(attribution)),
    ).toEqual(attribution);
  });
});
