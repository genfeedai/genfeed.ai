import {
  deriveBrandNameFromDomain,
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

  it('falls back to manual brand setup for personal domains', () => {
    const intent = resolvePostSignupIntent({
      personalEmailDomains: PERSONAL_DOMAINS,
      primaryEmail: 'user@gmail.com',
      selectedCredits: null,
      selectedPlan: null,
    });

    expect(intent).toEqual({ kind: 'manual-brand' });
  });

  it('falls back to manual brand setup when credits are invalid', () => {
    const intent = resolvePostSignupIntent({
      personalEmailDomains: PERSONAL_DOMAINS,
      primaryEmail: 'user@gmail.com',
      selectedCredits: '0',
      selectedPlan: null,
    });

    expect(intent).toEqual({ kind: 'manual-brand' });
  });
});

describe('deriveBrandNameFromDomain', () => {
  it('converts domain into a readable brand label', () => {
    expect(deriveBrandNameFromDomain('genfeed-ai.com')).toBe('Genfeed Ai');
    expect(deriveBrandNameFromDomain('studio.acme.io')).toBe('Studio Acme');
  });
});
