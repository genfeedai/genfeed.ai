import {
  appendCheckoutReturnParams,
  buildOnboardingResumeHref,
  deriveBrandNameFromDomain,
  hasPaidPlanIntent,
  isFreePlanHandoff,
  parseSelectedCredits,
} from '@app/(onboarding)/onboarding/post-signup/post-signup-routing.util';
import { describe, expect, it } from 'vitest';

describe('isFreePlanHandoff', () => {
  it('recognizes free marketing plan slugs', () => {
    expect(isFreePlanHandoff('payg')).toBe(true);
    expect(isFreePlanHandoff(' FREE ')).toBe(true);
    expect(isFreePlanHandoff('price_123')).toBe(false);
  });
});

describe('hasPaidPlanIntent (genfeedai/genfeed.ai#5311)', () => {
  it('never counts a free or payg handoff as paid intent', () => {
    expect(hasPaidPlanIntent('payg')).toBe(false);
    expect(hasPaidPlanIntent('free')).toBe(false);
    expect(hasPaidPlanIntent(' FREE ')).toBe(false);
  });

  it('treats an empty or missing plan as no intent', () => {
    expect(hasPaidPlanIntent(null)).toBe(false);
    expect(hasPaidPlanIntent(undefined)).toBe(false);
    expect(hasPaidPlanIntent('   ')).toBe(false);
  });

  it('counts a real paid plan as intent', () => {
    expect(hasPaidPlanIntent('price_123')).toBe(true);
    expect(hasPaidPlanIntent('hosted')).toBe(true);
  });
});

describe('parseSelectedCredits', () => {
  it('parses positive integer credit packs only', () => {
    expect(parseSelectedCredits('0500')).toBe(500);
    expect(parseSelectedCredits(' 1000 ')).toBe(1000);
    expect(parseSelectedCredits('1000.5')).toBeNull();
    expect(parseSelectedCredits('500abc')).toBeNull();
    expect(parseSelectedCredits('0')).toBeNull();
  });
});

describe('deriveBrandNameFromDomain', () => {
  it('converts domain into a readable brand label', () => {
    expect(deriveBrandNameFromDomain('genfeed-ai.com')).toBe('Genfeed Ai');
    expect(deriveBrandNameFromDomain('studio.acme.io')).toBe('Studio Acme');
  });
});

describe('buildOnboardingResumeHref', () => {
  it('builds the resume href for a step', () => {
    expect(buildOnboardingResumeHref('brand')).toBe('/onboarding/brand');
    expect(buildOnboardingResumeHref('providers')).toBe(
      '/onboarding/providers',
    );
  });

  it('appends checkout return markers without dropping existing query params', () => {
    expect(
      appendCheckoutReturnParams('/onboarding/brand', 'plan-checkout'),
    ).toBe('/onboarding/brand?checkout=completed&checkoutKind=plan');

    expect(
      appendCheckoutReturnParams('/onboarding/providers', 'credits-checkout'),
    ).toBe('/onboarding/providers?checkout=completed&checkoutKind=credits');
  });
});
