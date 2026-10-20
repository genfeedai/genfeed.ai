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
  ONBOARDING_DRAFT_PLATFORMS,
  ONBOARDING_MAX_DRAFT_ROUNDS,
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
    it('detects the brand wizard step', () => {
      expect(hasCompletedBrandOnboardingStep(undefined)).toBe(false);
      expect(hasCompletedBrandOnboardingStep([])).toBe(false);
      expect(hasCompletedBrandOnboardingStep(['brand'])).toBe(true);
    });

    it('leaves onboarding after the single web step', () => {
      expect(
        resolveOnboardingContinueHref({
          completedStep: 'brand',
          hasSingleStepOnboarding: true,
        }),
      ).toBe('/');
    });

    it('keeps Desktop continue from brand on the shared providers step', () => {
      expect(
        resolveOnboardingContinueHref({
          completedStep: 'brand',
          hasSingleStepOnboarding: false,
        }),
      ).toBe('/onboarding/providers');
    });

    it('sequences the Desktop wizard tail and then leaves onboarding', () => {
      expect(
        resolveOnboardingContinueHref({
          completedStep: 'providers',
          hasSingleStepOnboarding: false,
        }),
      ).toBe('/onboarding/summary');
      expect(
        resolveOnboardingContinueHref({
          completedStep: 'summary',
          hasSingleStepOnboarding: false,
        }),
      ).toBe('/');
    });

    it('sends incomplete web users to the single onboarding page', () => {
      expect(
        resolveForcedOnboardingHref({
          completedSteps: [],
          hasSingleStepOnboarding: true,
        }),
      ).toBe('/onboarding/brand');
    });

    it('never sends a web user to a removed agent conversation', () => {
      for (const accountType of [
        undefined,
        OrganizationCategory.CREATOR,
        OrganizationCategory.AGENCY,
      ]) {
        expect(
          resolveForcedOnboardingHref({
            accountType,
            completedSteps: ['brand'],
            hasSingleStepOnboarding: true,
          }),
        ).not.toContain('agent');
      }
    });

    it('resumes Desktop at the first incomplete wizard step', () => {
      expect(
        resolveForcedOnboardingHref({
          completedSteps: ['brand'],
          hasSingleStepOnboarding: false,
        }),
      ).toBe('/onboarding/providers');
    });

    it('builds the resume href for a step', () => {
      expect(buildOnboardingResumeHref('brand')).toBe('/onboarding/brand');
      expect(buildOnboardingResumeHref('providers')).toBe(
        '/onboarding/providers',
      );
    });
  });

  describe('first drafts', () => {
    it('drafts for X, Instagram, TikTok and LinkedIn', () => {
      expect(ONBOARDING_DRAFT_PLATFORMS).toEqual([
        'twitter',
        'instagram',
        'tiktok',
        'linkedin',
      ]);
    });

    it('allows at most two draft rounds', () => {
      expect(ONBOARDING_MAX_DRAFT_ROUNDS).toBe(2);
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
          hasSingleStepOnboarding: false,
        }),
      ).toEqual(EXPERT_ONBOARDING_STEPS);
      expect(
        resolveOnboardingSteps({
          accountType: expert,
          hasSingleStepOnboarding: true,
        }),
      ).toEqual(['brand', 'positioning', 'corpus']);
      expect(
        resolveOnboardingSteps({
          accountType: OrganizationCategory.AGENCY,
          hasSingleStepOnboarding: false,
        }),
      ).toEqual(ONBOARDING_STEPS);
      expect(
        resolveOnboardingSteps({
          accountType: OrganizationCategory.AGENCY,
          hasSingleStepOnboarding: true,
        }),
      ).toEqual(['brand']);
    });

    it('routes an expert from brand to positioning', () => {
      expect(
        resolveOnboardingContinueHref({
          accountType: expert,
          completedStep: 'brand',
          hasSingleStepOnboarding: true,
        }),
      ).toBe('/onboarding/positioning');
      expect(
        resolveOnboardingContinueHref({
          accountType: expert,
          completedStep: 'positioning',
          hasSingleStepOnboarding: true,
        }),
      ).toBe('/onboarding/corpus');
    });

    it('ends the expert wizard on first-system on every surface', () => {
      expect(
        resolveOnboardingContinueHref({
          accountType: expert,
          completedStep: 'corpus',
          hasSingleStepOnboarding: true,
        }),
      ).toBe('/onboarding/first-system');
      expect(
        resolveOnboardingContinueHref({
          accountType: expert,
          completedStep: 'corpus',
          hasSingleStepOnboarding: false,
        }),
      ).toBe('/onboarding/providers');
      expect(
        resolveOnboardingContinueHref({
          accountType: expert,
          completedStep: 'summary',
          hasSingleStepOnboarding: false,
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
          hasSingleStepOnboarding: true,
        }),
      ).toBe('/onboarding/corpus');
      expect(
        resolveForcedOnboardingHref({
          accountType: expert,
          completedSteps: ['brand', 'positioning', 'corpus'],
          hasSingleStepOnboarding: true,
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
