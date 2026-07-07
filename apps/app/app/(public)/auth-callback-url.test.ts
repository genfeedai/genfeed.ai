import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getAuthCallbackURL,
  getAuthFlowHref,
  toAbsoluteAuthCallbackURL,
} from './auth-callback-url';

const SERVER_FALLBACK_ORIGIN = 'https://app.genfeed.ai';

describe('auth callback URL helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefers callbackUrl and falls back to root', () => {
    expect(
      getAuthCallbackURL(new URLSearchParams('callbackUrl=%2Fonboarding')),
    ).toBe('/onboarding');
    expect(getAuthCallbackURL(new URLSearchParams())).toBe('/');
  });

  it('builds a post-signup callback carrying onboarding handoff params', () => {
    expect(
      getAuthCallbackURL(
        new URLSearchParams(
          'plan=pro&credits=0500&brandDomain=https%3A%2F%2Fwww.acme.co%2Fproducts&brandName= Acme ',
        ),
        { includeOnboardingHandoffParams: true },
      ),
    ).toBe(
      '/onboarding/post-signup?plan=pro&credits=500&brandDomain=acme.co&brandName=Acme',
    );
  });

  it('preserves explicit callbacks when handoff params are present', () => {
    expect(
      getAuthCallbackURL(
        new URLSearchParams(
          'callbackUrl=genfeedai-desktop%3A%2F%2Fauth&plan=pro',
        ),
        { includeOnboardingHandoffParams: true },
      ),
    ).toBe('genfeedai-desktop://auth');
  });

  it('builds auth route links that preserve callbackUrl only when needed', () => {
    expect(getAuthFlowHref('/forgot-password', '/')).toBe('/forgot-password');
    expect(getAuthFlowHref('/forgot-password', '/oauth/cli?port=4321')).toBe(
      '/forgot-password?callbackUrl=%2Foauth%2Fcli%3Fport%3D4321',
    );
  });

  it('expands relative callbacks to the active app origin', () => {
    expect(toAbsoluteAuthCallbackURL('/oauth/cli?port=4321')).toBe(
      `${window.location.origin}/oauth/cli?port=4321`,
    );
  });

  it('falls back to the hosted app origin when no window is available', () => {
    vi.stubGlobal('window', undefined);

    expect(toAbsoluteAuthCallbackURL('/oauth/cli?port=4321')).toBe(
      `${SERVER_FALLBACK_ORIGIN}/oauth/cli?port=4321`,
    );
  });

  it('leaves absolute callbacks and desktop deep links unchanged', () => {
    expect(toAbsoluteAuthCallbackURL('https://app.genfeed.ai/')).toBe(
      'https://app.genfeed.ai/',
    );
    expect(toAbsoluteAuthCallbackURL('genfeedai-desktop://auth')).toBe(
      'genfeedai-desktop://auth',
    );
  });

  it('rejects insecure callbacks to fixed hosted app domains', () => {
    expect(toAbsoluteAuthCallbackURL('http://app.genfeed.ai/oauth')).toBe(
      `${window.location.origin}/`,
    );
  });

  it('rewrites external and dangerous-scheme callbacks to the origin root', () => {
    const root = `${window.location.origin}/`;
    expect(toAbsoluteAuthCallbackURL('https://evil.com/phish')).toBe(root);
    expect(toAbsoluteAuthCallbackURL('http://evil.com')).toBe(root);
    expect(toAbsoluteAuthCallbackURL('//evil.com')).toBe(root);
    expect(toAbsoluteAuthCallbackURL('javascript:alert(1)')).toBe(root);
    expect(
      toAbsoluteAuthCallbackURL('data:text/html,<script>alert(1)</script>'),
    ).toBe(root);
  });
});
