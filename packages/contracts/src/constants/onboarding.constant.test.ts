import { describe, expect, it } from 'vitest';
import { OrganizationCategory } from '../enums/organization.enum';
import {
  buildOnboardingResumeHref,
  EXPERT_ONBOARDING_STEPS,
  EXPERT_SETUP_CARD_STEPS,
  getResumeStep,
  hasCompletedBrandOnboardingStep,
  isExpertAccountType,
  isOnboardingStepKey,
  isSharedBrandOnboardingPath,
  ONBOARDING_STEP_LABELS,
  ONBOARDING_STEPS,
  PERSONAL_EMAIL_DOMAINS,
  resolveForcedOnboardingHref,
  resolveOnboardingContinueHref,
  resolveOnboardingSteps,
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

    it('keeps the wizard tail sequenced on agent-first surfaces', () => {
      // Cloud walks an operator through brand only, but providers and summary
      // stay reachable on their own; continuing from providers must not drop
      // straight to the root.
      expect(
        resolveOnboardingContinueHref({
          completedStep: 'providers',
          hasAgentFirstOnboarding: true,
        }),
      ).toBe('/onboarding/summary');
      expect(
        resolveOnboardingContinueHref({
          completedStep: 'summary',
          hasAgentFirstOnboarding: true,
        }),
      ).toBe('/');
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

  describe('expert path routing', () => {
    const expert = OrganizationCategory.EXPERT;

    it('orders the expert wizard brand → positioning → corpus → providers → summary', () => {
      expect(EXPERT_ONBOARDING_STEPS).toEqual([
        'brand',
        'positioning',
        'corpus',
        'providers',
        'summary',
      ]);
      expect(ONBOARDING_STEP_LABELS.positioning).toBe('Positioning');
      expect(ONBOARDING_STEP_LABELS.corpus).toBe('Corpus');
    });

    it('recognizes only EXPERT as the expert account type', () => {
      expect(isExpertAccountType(expert)).toBe(true);
      expect(isExpertAccountType(OrganizationCategory.CREATOR)).toBe(false);
      expect(isExpertAccountType(null)).toBe(false);
    });

    it('resolves steps per account type and surface', () => {
      expect(
        resolveOnboardingSteps({
          accountType: expert,
          hasAgentFirstOnboarding: false,
        }),
      ).toEqual(EXPERT_ONBOARDING_STEPS);
      expect(
        resolveOnboardingSteps({
          accountType: expert,
          hasAgentFirstOnboarding: true,
        }),
      ).toEqual(['brand', 'positioning', 'corpus']);
      expect(
        resolveOnboardingSteps({
          accountType: OrganizationCategory.AGENCY,
          hasAgentFirstOnboarding: false,
        }),
      ).toEqual(ONBOARDING_STEPS);
      expect(
        resolveOnboardingSteps({
          accountType: OrganizationCategory.AGENCY,
          hasAgentFirstOnboarding: true,
        }),
      ).toEqual(['brand']);
    });

    it('routes an expert from brand to positioning instead of the agent', () => {
      expect(
        resolveOnboardingContinueHref({
          accountType: expert,
          completedStep: 'brand',
          hasAgentFirstOnboarding: true,
          orgSlug: 'acme',
        }),
      ).toBe('/onboarding/positioning');
      expect(
        resolveOnboardingContinueHref({
          accountType: expert,
          completedStep: 'positioning',
          hasAgentFirstOnboarding: true,
        }),
      ).toBe('/onboarding/corpus');
    });

    it('ends the expert wizard on first-system on every surface', () => {
      expect(
        resolveOnboardingContinueHref({
          accountType: expert,
          completedStep: 'corpus',
          hasAgentFirstOnboarding: true,
        }),
      ).toBe('/onboarding/first-system');
      expect(
        resolveOnboardingContinueHref({
          accountType: expert,
          completedStep: 'corpus',
          hasAgentFirstOnboarding: false,
        }),
      ).toBe('/onboarding/providers');
      expect(
        resolveOnboardingContinueHref({
          accountType: expert,
          completedStep: 'summary',
          hasAgentFirstOnboarding: false,
        }),
      ).toBe('/onboarding/first-system');
    });

    it('resumes an expert at the first incomplete expert step', () => {
      expect(getResumeStep(['brand'], EXPERT_ONBOARDING_STEPS)).toBe(
        'positioning',
      );
      expect(
        resolveForcedOnboardingHref({
          accountType: expert,
          completedSteps: ['brand', 'positioning'],
          hasAgentFirstOnboarding: true,
        }),
      ).toBe('/onboarding/corpus');
      expect(
        resolveForcedOnboardingHref({
          accountType: expert,
          completedSteps: ['brand', 'positioning', 'corpus'],
          hasAgentFirstOnboarding: true,
        }),
      ).toBe('/onboarding/first-system');
    });

    it('guards step keys', () => {
      expect(isOnboardingStepKey('corpus')).toBe(true);
      expect(isOnboardingStepKey('first-system')).toBe(false);
      expect(isOnboardingStepKey(undefined)).toBe(false);
    });

    it('lists positioning, corpus, and first-system as expert workspace tasks', () => {
      expect(EXPERT_SETUP_CARD_STEPS.map((step) => step.key)).toEqual([
        'positioning',
        'corpus',
        'first-system',
      ]);
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
