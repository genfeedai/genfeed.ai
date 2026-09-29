import {
  buildOnboardingResumeHref,
  deriveBrandNameFromDomain,
  hasPaidPlanIntent,
  isFreePlanHandoff,
  parseSelectedCredits,
  resolvePostSignupIntent,
} from '@app/(onboarding)/onboarding/post-signup/post-signup-routing.util';
import { describe, expect, it } from 'vitest';

const PERSONAL_DOMAINS = ['gmail.com', 'outlook.com', 'yahoo.com'] as const;

describe('resolvePostSignupIntent', () => {
  it('prioritizes selected plan checkout', () => {
    const intent = resolvePostSignupIntent({
      personalEmailDomains: PERSONAL_DOMAINS,
      primaryEmail: 'team@acme.com',
      selectedCredits: '500',
      selectedPlan: 'price_123',
    });

    expect(intent).toEqual({
      kind: 'plan-checkout',
      stripePriceId: 'price_123',
    });
  });

  it('uses credits checkout for valid positive credit packs', () => {
    const intent = resolvePostSignupIntent({
      personalEmailDomains: PERSONAL_DOMAINS,
      primaryEmail: 'team@acme.com',
      selectedCredits: '1000',
      selectedPlan: null,
    });

    expect(intent).toEqual({
      credits: 1000,
      kind: 'credits-checkout',
    });
  });

  it('falls back to auto-brand for corporate email domains', () => {
    const intent = resolvePostSignupIntent({
      personalEmailDomains: PERSONAL_DOMAINS,
      primaryEmail: 'owner@acme.co',
      selectedCredits: null,
      selectedPlan: null,
    });

    expect(intent).toEqual({
      domain: 'acme.co',
      kind: 'auto-brand',
    });
  });

  it('rejects credit values with trailing non-numeric characters', () => {
    const intent = resolvePostSignupIntent({
      personalEmailDomains: PERSONAL_DOMAINS,
      primaryEmail: 'user@gmail.com',
      selectedCredits: '500abc',
      selectedPlan: null,
    });

    expect(intent).toEqual({ kind: 'manual-brand' });
  });
});

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
  it('keeps other onboarding steps unchanged', () => {
    expect(buildOnboardingResumeHref('providers', 'acme.co')).toBe(
      '/onboarding/providers',
    );
  });
});
