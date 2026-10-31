import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getAuthCallbackURL,
  getAuthErrorCallbackURL,
  getAuthFlowHref,
  parseBrandOsPreviewToken,
  parsePublicYoutubeClipperToken,
  resolveOAuthLoginErrorMessage,
  toAbsoluteAuthCallbackURL,
  toAbsolutePasswordResetURL,
} from './auth-callback-url';

const SERVER_FALLBACK_ORIGIN = 'https://app.genfeed.ai';

describe('auth callback URL helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends Google failures to the login page on the current origin', () => {
    expect(getAuthErrorCallbackURL()).toBe(`${window.location.origin}/login`);
    expect(getAuthErrorCallbackURL('/oauth/consent?client_id=c&state=s')).toBe(
      `${window.location.origin}/login?callbackUrl=${encodeURIComponent('/oauth/consent?client_id=c&state=s')}`,
    );
  });

  it('maps Better Auth OAuth error codes to login copy', () => {
    expect(resolveOAuthLoginErrorMessage('state_mismatch')).toBe(
      'Google sign-in was interrupted. Please try again.',
    );
    expect(resolveOAuthLoginErrorMessage('access_denied')).toBe(
      'Google sign-in was cancelled.',
    );
    expect(resolveOAuthLoginErrorMessage('invalid_code')).toBe(
      'Google sign-in failed. Please try again.',
    );
    expect(resolveOAuthLoginErrorMessage('javascript:alert(1)')).toBeNull();
    expect(resolveOAuthLoginErrorMessage(null)).toBeNull();
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
          'plan=price_pro123&credits=0500&brandDomain=https%3A%2F%2Fwww.acme.co%2Fproducts&brandName= Acme ',
        ),
        { includeOnboardingHandoffParams: true },
      ),
    ).toBe(
      '/onboarding/post-signup?plan=price_pro123&credits=500&brandDomain=acme.co&brandName=Acme',
    );
  });

  it.each([
    ['500', '500'],
    [' \t00500\n ', '500'],
    ['0001', '1'],
    ['9007199254740993', '9007199254740992'],
    ['1000000000000000000000', '1e+21'],
    ['9'.repeat(309), 'Infinity'],
    [null, null],
    [undefined, null],
    ['', null],
    [' \t\n ', null],
    ['0', null],
    ['000', null],
    ['-500', null],
    ['+500', null],
    ['5.00', null],
    ['500abc', null],
    ['5e2', null],
    ['5 00', null],
    ['５００', null],
    ['٥٠٠', null],
  ])('normalizes credits %j in the callback to %j', (credits, expected) => {
    const params = new URLSearchParams();
    if (credits != null) {
      params.set('credits', credits);
    }

    const callback = getAuthCallbackURL(params, {
      includeOnboardingHandoffParams: true,
    });
    const url = new URL(callback, SERVER_FALLBACK_ORIGIN);

    expect(url.pathname).toBe('/onboarding/post-signup');
    expect(url.searchParams.get('credits')).toBe(expected);
  });

  it('forwards normalized signup attribution on the post-signup callback', () => {
    expect(
      getAuthCallbackURL(
        new URLSearchParams(
          'plan=price_pro123&utm_source=ChatGPT&utm_term=private&signup_referrer=chatgpt.com&signup_landing=%2Fstudio%3Fx%3D1',
        ),
        { includeOnboardingHandoffParams: true },
      ),
    ).toBe(
      '/onboarding/post-signup?plan=price_pro123&signup_landing=%2Fstudio&signup_referrer=chatgpt.com&utm_source=chatgpt',
    );
  });

  it('carries the stored first touch over the current URL for other devices', () => {
    expect(
      getAuthCallbackURL(new URLSearchParams('utm_source=newsletter'), {
        includeOnboardingHandoffParams: true,
        signupAttribution: {
          referrerDomain: 'google.com',
          utmSource: 'producthunt',
        },
      }),
    ).toBe(
      '/onboarding/post-signup?signup_referrer=google.com&utm_source=producthunt',
    );
  });

  it('never mixes a later visit’s fields into the stored first touch', () => {
    expect(
      getAuthCallbackURL(new URLSearchParams('utm_source=newsletter'), {
        includeOnboardingHandoffParams: true,
        signupAttribution: { referrerDomain: 'google.com' },
      }),
    ).toBe('/onboarding/post-signup?signup_referrer=google.com');
  });

  it('forwards the current URL source when nothing was stored', () => {
    expect(
      getAuthCallbackURL(new URLSearchParams('utm_source=newsletter'), {
        includeOnboardingHandoffParams: true,
        signupAttribution: {},
      }),
    ).toBe('/onboarding/post-signup?utm_source=newsletter');
  });

  it('preserves explicit callbacks when handoff params are present', () => {
    expect(
      getAuthCallbackURL(
        new URLSearchParams(
          'callbackUrl=genfeedai-desktop%3A%2F%2Fauth&plan=price_pro123',
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

  it('preserves only a bounded opaque clipper-tool token through post-signup', () => {
    const token = 'b'.repeat(43);
    expect(
      getAuthCallbackURL(new URLSearchParams({ clipToolToken: token })),
    ).toBe(`/onboarding/post-signup?clipToolToken=${token}`);
    expect(parsePublicYoutubeClipperToken(token)).toBe(token);
    expect(
      parsePublicYoutubeClipperToken('https://youtube.com/watch?v=x'),
    ).toBeNull();
    expect(parsePublicYoutubeClipperToken('b'.repeat(44))).toBeNull();
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
