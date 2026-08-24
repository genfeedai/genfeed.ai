import { describe, expect, it } from 'vitest';
import {
  buildOnboardingResumeHref,
  getResumeStep,
  hasCompletedBrandOnboardingStep,
  isSharedBrandOnboardingPath,
  ONBOARDING_STEP_LABELS,
  ONBOARDING_STEPS,
  PERSONAL_EMAIL_DOMAINS,
  resolveForcedOnboardingHref,
  resolveOnboardingContinueHref,
  SETUP_CARD_STEPS,
} from './onboarding.constant';

describe('onboarding.constant', () => {
  describe('ONBOARDING_STEPS', () => {
    it('has brand, providers, and summary in order', () => {
      expect(ONBOARDING_STEPS).toEqual(['brand', 'providers', 'summary']);
    });
  });

  describe('ONBOARDING_STEP_LABELS', () => {
    it('maps steps to display labels', () => {
      expect(ONBOARDING_STEP_LABELS.brand).toBe('Brand');
      expect(ONBOARDING_STEP_LABELS.providers).toBe('Providers');
      expect(ONBOARDING_STEP_LABELS.summary).toBe('Summary');
    });
  });

  describe('getResumeStep', () => {
    it('returns "brand" when no completed steps', () => {
      expect(getResumeStep()).toBe('brand');
    });

    it('returns "brand" for empty array', () => {
      expect(getResumeStep([])).toBe('brand');
    });

    it('returns "providers" when brand is completed', () => {
      expect(getResumeStep(['brand'])).toBe('providers');
    });

    it('returns "summary" when providers are completed', () => {
      expect(getResumeStep(['brand', 'providers'])).toBe('summary');
    });

    it('returns "summary" when all steps completed', () => {
      expect(getResumeStep(['brand', 'providers', 'summary'])).toBe('summary');
    });

    it('returns first incomplete step in order', () => {
      expect(getResumeStep(['plan'])).toBe('brand');
    });
  });

  describe('shared brand routing', () => {
    it('treats /onboarding and /onboarding/brand as the shared brand entry', () => {
      expect(isSharedBrandOnboardingPath('/onboarding/brand')).toBe(true);
      expect(isSharedBrandOnboardingPath('/onboarding')).toBe(true);
      expect(isSharedBrandOnboardingPath('/onboarding/providers')).toBe(false);
    });

    it('detects the brand wizard step', () => {
      expect(hasCompletedBrandOnboardingStep(undefined)).toBe(false);
      expect(hasCompletedBrandOnboardingStep([])).toBe(false);
      expect(hasCompletedBrandOnboardingStep(['brand'])).toBe(true);
    });

    it('sends Cloud continue from brand into the agent conversation', () => {
      expect(
        resolveOnboardingContinueHref({
          completedStep: 'brand',
          hasAgentFirstOnboarding: true,
          orgSlug: 'acme',
        }),
      ).toBe('/acme/~/agent/onboarding');
    });

    it('keeps Desktop continue from brand on the shared providers step', () => {
      expect(
        resolveOnboardingContinueHref({
          completedStep: 'brand',
          hasAgentFirstOnboarding: false,
        }),
      ).toBe('/onboarding/providers');
    });

    it('forces incomplete Cloud users onto the shared brand form', () => {
      expect(
        resolveForcedOnboardingHref({
          brandDomain: 'acme.co',
          completedSteps: [],
          hasAgentFirstOnboarding: true,
          orgSlug: 'acme',
        }),
      ).toBe('/onboarding/brand?auto=true');
    });

    it('forces Cloud users who already confirmed brand into the agent', () => {
      expect(
        resolveForcedOnboardingHref({
          completedSteps: ['brand'],
          hasAgentFirstOnboarding: true,
          orgSlug: 'acme',
        }),
      ).toBe('/acme/~/agent/onboarding');
    });

    it('resumes Desktop at the first incomplete wizard step', () => {
      expect(
        resolveForcedOnboardingHref({
          completedSteps: ['brand'],
          hasAgentFirstOnboarding: false,
        }),
      ).toBe('/onboarding/providers');
    });

    it('adds auto-brand resume when a stored brand domain is available', () => {
      expect(buildOnboardingResumeHref('brand', 'acme.co')).toBe(
        '/onboarding/brand?auto=true',
      );
    });
  });

  describe('SETUP_CARD_STEPS', () => {
    it('has preferences and platforms', () => {
      expect(SETUP_CARD_STEPS.map((s) => s.key)).toEqual([
        'preferences',
        'platforms',
      ]);
    });

    it('each step has description and label', () => {
      for (const step of SETUP_CARD_STEPS) {
        expect(step.label).toBeTruthy();
        expect(step.description).toBeTruthy();
      }
    });
  });

  describe('PERSONAL_EMAIL_DOMAINS', () => {
    it('includes gmail.com', () => {
      expect(PERSONAL_EMAIL_DOMAINS).toContain('gmail.com');
    });

    it('includes yahoo.com', () => {
      expect(PERSONAL_EMAIL_DOMAINS).toContain('yahoo.com');
    });

    it('includes outlook.com', () => {
      expect(PERSONAL_EMAIL_DOMAINS).toContain('outlook.com');
    });

    it('does not include corporate domains', () => {
      expect(PERSONAL_EMAIL_DOMAINS).not.toContain('company.com');
    });
  });
});
