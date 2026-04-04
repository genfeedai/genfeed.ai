import { describe, expect, it } from 'vitest';
import {
  ContentType,
  OptimizationCategory,
  OptimizationSuggestionType,
  SchedulingMethod,
  Sentiment,
} from '../src/content-type.enum';

describe('content-type.enum', () => {
  describe('ContentType', () => {
    it('should have 5 members', () => {
      expect(Object.values(ContentType)).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(ContentType.CAPTION).toBe('caption');
      expect(ContentType.VIDEO).toBe('video');
      expect(ContentType.IMAGE).toBe('image');
      expect(ContentType.ARTICLE).toBe('article');
      expect(ContentType.SCRIPT).toBe('script');
    });
  });

  describe('Sentiment', () => {
    it('should have 3 members', () => {
      expect(Object.values(Sentiment)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(Sentiment.POSITIVE).toBe('positive');
      expect(Sentiment.NEUTRAL).toBe('neutral');
      expect(Sentiment.NEGATIVE).toBe('negative');
    });
  });

  describe('OptimizationSuggestionType', () => {
    it('should have 3 members', () => {
      expect(Object.values(OptimizationSuggestionType)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(OptimizationSuggestionType.IMPROVEMENT).toBe('improvement');
      expect(OptimizationSuggestionType.WARNING).toBe('warning');
      expect(OptimizationSuggestionType.TIP).toBe('tip');
    });
  });

  describe('OptimizationCategory', () => {
    it('should have 6 members', () => {
      expect(Object.values(OptimizationCategory)).toHaveLength(6);
    });

    it('should have correct values', () => {
      expect(OptimizationCategory.ENGAGEMENT).toBe('engagement');
      expect(OptimizationCategory.CLARITY).toBe('clarity');
      expect(OptimizationCategory.LENGTH).toBe('length');
      expect(OptimizationCategory.HASHTAGS).toBe('hashtags');
      expect(OptimizationCategory.CTA).toBe('cta');
      expect(OptimizationCategory.TONE).toBe('tone');
    });
  });

  describe('SchedulingMethod', () => {
    it('should have 3 members', () => {
      expect(Object.values(SchedulingMethod)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(SchedulingMethod.AI_OPTIMAL).toBe('ai-optimal');
      expect(SchedulingMethod.MANUAL).toBe('manual');
      expect(SchedulingMethod.BULK).toBe('bulk');
    });
  });
});
