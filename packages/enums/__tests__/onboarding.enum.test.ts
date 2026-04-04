import { describe, expect, it } from 'vitest';
import {
  BrandExtractionStatus,
  OnboardingStatus,
  OnboardingStep,
} from '../src/onboarding.enum';

describe('onboarding.enum', () => {
  describe('OnboardingStep', () => {
    it('should have 5 members', () => {
      expect(Object.values(OnboardingStep)).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(OnboardingStep.WELCOME).toBe('welcome');
      expect(OnboardingStep.BRAND_URL).toBe('brand_url');
      expect(OnboardingStep.PROCESSING).toBe('processing');
      expect(OnboardingStep.REVIEW).toBe('review');
      expect(OnboardingStep.COMPLETED).toBe('completed');
    });
  });

  describe('OnboardingStatus', () => {
    it('should have 4 members', () => {
      expect(Object.values(OnboardingStatus)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(OnboardingStatus.NOT_STARTED).toBe('not_started');
      expect(OnboardingStatus.IN_PROGRESS).toBe('in_progress');
      expect(OnboardingStatus.COMPLETED).toBe('completed');
      expect(OnboardingStatus.SKIPPED).toBe('skipped');
    });
  });

  describe('BrandExtractionStatus', () => {
    it('should have 6 members', () => {
      expect(Object.values(BrandExtractionStatus)).toHaveLength(6);
    });

    it('should have correct values', () => {
      expect(BrandExtractionStatus.PENDING).toBe('pending');
      expect(BrandExtractionStatus.SCRAPING).toBe('scraping');
      expect(BrandExtractionStatus.ANALYZING).toBe('analyzing');
      expect(BrandExtractionStatus.GENERATING_PROMPTS).toBe(
        'generating_prompts',
      );
      expect(BrandExtractionStatus.COMPLETED).toBe('completed');
      expect(BrandExtractionStatus.FAILED).toBe('failed');
    });
  });
});
