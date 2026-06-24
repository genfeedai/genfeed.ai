import { describe, expect, it } from 'vitest';

import {
  getAuthCallbackURL,
  toAbsoluteAuthCallbackURL,
} from './auth-callback-url';

describe('auth callback URL helpers', () => {
  it('prefers callbackUrl and falls back to root', () => {
    expect(
      getAuthCallbackURL(new URLSearchParams('callbackUrl=%2Fonboarding')),
    ).toBe('/onboarding');
    expect(getAuthCallbackURL(new URLSearchParams())).toBe('/');
  });

  it('expands relative callbacks to the active app origin', () => {
    expect(toAbsoluteAuthCallbackURL('/oauth/cli?port=4321')).toBe(
      `${window.location.origin}/oauth/cli?port=4321`,
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
});
