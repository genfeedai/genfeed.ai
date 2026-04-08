import { describe, expect, it } from 'vitest';
import { resolvePostSignupOnboardingHref } from './post-signup-onboarding-href.util';

describe('resolvePostSignupOnboardingHref', () => {
  it('keeps the flat onboarding route in self-hosted mode', () => {
    expect(
      resolvePostSignupOnboardingHref({
        isSelfHosted: true,
        organizations: [{ isActive: true, slug: 'acme' }],
        prompt: 'hello',
      }),
    ).toBe('/chat/onboarding?prompt=hello');
  });

  it('uses the active organization slug in cloud-connected mode', () => {
    expect(
      resolvePostSignupOnboardingHref({
        isSelfHosted: false,
        organizations: [
          { isActive: false, slug: 'other-org' },
          { isActive: true, slug: 'active-org' },
        ],
        prompt: 'hello world',
      }),
    ).toBe('/active-org/~/chat/onboarding?prompt=hello%20world');
  });

  it('falls back to the first organization when none are marked active', () => {
    expect(
      resolvePostSignupOnboardingHref({
        isSelfHosted: false,
        organizations: [{ isActive: false, slug: 'first-org' }],
      }),
    ).toBe('/first-org/~/chat/onboarding');
  });

  it('falls back to the flat onboarding route when no organizations are available', () => {
    expect(
      resolvePostSignupOnboardingHref({
        isSelfHosted: false,
        organizations: [],
        prompt: 'brand setup',
      }),
    ).toBeNull();
  });
});
