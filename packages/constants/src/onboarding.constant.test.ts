import { describe, expect, it } from 'vitest';
import {
  getResumeStep,
  ONBOARDING_STEP_LABELS,
  ONBOARDING_STEPS,
  PERSONAL_EMAIL_DOMAINS,
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
