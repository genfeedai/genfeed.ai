import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getAuthCallbackURL,
  getAuthFlowHref,
  parseBrandOsPreviewToken,
  parsePublicYoutubeClipToken,
  toAbsoluteAuthCallbackURL,
  toAbsolutePasswordResetURL,
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
      `${window.location.origin}/?callbackUrl=%2Foauth%2Fcli%3Fport%3D4321`,
    );
  });

  it('falls back to the hosted app origin when no window is available', () => {
    vi.stubGlobal('window', undefined);

    expect(toAbsoluteAuthCallbackURL('/oauth/cli?port=4321')).toBe(
      `${SERVER_FALLBACK_ORIGIN}/?callbackUrl=%2Foauth%2Fcli%3Fport%3D4321`,
    );
  });

  it('uses one fixed browser callback and leaves desktop deep links unchanged', () => {
    expect(toAbsoluteAuthCallbackURL('/')).toBe(`${window.location.origin}/`);
    expect(toAbsoluteAuthCallbackURL('genfeedai-desktop://auth')).toBe(
      'genfeedai-desktop://auth',
    );
  });

  it('keeps password-reset completion on its fixed public action page', () => {
    expect(
      toAbsolutePasswordResetURL(
        '/reset-password?callbackUrl=%2Foauth%2Fcli%3Fport%3D4321',
      ),
    ).toBe(
      `${window.location.origin}/reset-password?callbackUrl=%2Foauth%2Fcli%3Fport%3D4321`,
    );
    expect(toAbsolutePasswordResetURL('/api/version')).toBe(
      `${window.location.origin}/reset-password`,
    );
  });

  it('does not accept absolute URLs as explicit continuation values', () => {
    const root = `${window.location.origin}/`;
    expect(
      getAuthCallbackURL(
        new URLSearchParams({
          callbackUrl: 'https://app.genfeed.ai/onboarding',
        }),
      ),
    ).toBe('/');
    expect(toAbsoluteAuthCallbackURL('https://app.genfeed.ai/onboarding')).toBe(
      root,
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

  it.each([
    '/api/version',
    '/api%2Fversion',
    '/%61pi/version',
    '/v1/auth/get-session',
    '/trpc/session',
    '/_next/static/chunk.js',
    '/ingest',
    '/monitoring',
    '/.well-known/openid-configuration',
    '/robots.txt',
    '/login',
    '/logout',
    '/sign-up',
    '/?callbackUrl=%2Fonboarding',
    '/\\evil.example/',
    '\t/\\evil.example/',
    'https://app.genfeed.ai@evil.example/',
    'https://app.genfeed.ai/api/version',
  ])('rejects non-application callback destination %s', (callbackURL) => {
    const params = new URLSearchParams({ callbackUrl: callbackURL });
    const root = `${window.location.origin}/`;

    expect(getAuthCallbackURL(params)).toBe('/');
    expect(toAbsoluteAuthCallbackURL(callbackURL)).toBe(root);
  });

  it('uses the signup fallback when an explicit callback targets an API route', () => {
    expect(
      getAuthCallbackURL(new URLSearchParams('callbackUrl=%2Fapi%2Fversion'), {
        defaultCallbackURL: '/onboarding/post-signup',
        includeOnboardingHandoffParams: true,
      }),
    ).toBe('/onboarding/post-signup');
  });

  it('preserves only a bounded opaque Brand OS token through post-signup', () => {
    const token = 'a'.repeat(43);
    expect(
      getAuthCallbackURL(new URLSearchParams({ brandOsToken: token })),
    ).toBe(`/onboarding/post-signup?brandOsToken=${token}`);
    expect(parseBrandOsPreviewToken(token)).toBe(token);
    expect(parseBrandOsPreviewToken('raw guidance')).toBeNull();
    expect(parseBrandOsPreviewToken('a'.repeat(44))).toBeNull();
    expect(
      getAuthCallbackURL(
        new URLSearchParams({
          callbackUrl: `/onboarding/post-signup?brandOsToken=${token}`,
        }),
      ),
    ).toBe(`/onboarding/post-signup?brandOsToken=${token}`);
  });

  it('preserves only a bounded opaque clip-tool token through post-signup', () => {
    const token = 'b'.repeat(43);
    expect(
      getAuthCallbackURL(new URLSearchParams({ clipToolToken: token })),
    ).toBe(`/onboarding/post-signup?clipToolToken=${token}`);
    expect(parsePublicYoutubeClipToken(token)).toBe(token);
    expect(
      parsePublicYoutubeClipToken('https://youtube.com/watch?v=x'),
    ).toBeNull();
    expect(parsePublicYoutubeClipToken('b'.repeat(44))).toBeNull();
  });

  it('preserves a validated referral code through the external auth round trip', () => {
    expect(
      getAuthCallbackURL(new URLSearchParams({ ref: 'frend2345xyz' }), {
        includeOnboardingHandoffParams: true,
      }),
    ).toBe('/onboarding/post-signup?ref=frend2345xyz');
    expect(
      getAuthCallbackURL(new URLSearchParams({ ref: 'not a code' }), {
        includeOnboardingHandoffParams: true,
      }),
    ).toBe('/onboarding/post-signup');
  });
});
