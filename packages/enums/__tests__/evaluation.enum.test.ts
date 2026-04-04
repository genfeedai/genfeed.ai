import { describe, expect, it } from 'vitest';
import {
  EvaluationMode,
  EvaluationScoreCategory,
  EvaluationSeverity,
  EvaluationType,
} from '../src/evaluation.enum';

describe('evaluation.enum', () => {
  describe('EvaluationType', () => {
    it('should have 3 members', () => {
      expect(Object.values(EvaluationType)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(EvaluationType.PRE_PUBLICATION).toBe('pre-publication');
      expect(EvaluationType.POST_PUBLICATION).toBe('post-publication');
      expect(EvaluationType.EXTERNAL_ANALYSIS).toBe('external-analysis');
    });
  });

  describe('EvaluationSeverity', () => {
    it('should have 3 members', () => {
      expect(Object.values(EvaluationSeverity)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(EvaluationSeverity.INFO).toBe('info');
      expect(EvaluationSeverity.WARNING).toBe('warning');
      expect(EvaluationSeverity.CRITICAL).toBe('critical');
    });
  });

  describe('EvaluationMode', () => {
    it('should have 2 members', () => {
      expect(Object.values(EvaluationMode)).toHaveLength(2);
    });

    it('should have correct values', () => {
      expect(EvaluationMode.CHEAP).toBe('cheap');
      expect(EvaluationMode.DEEP).toBe('deep');
    });
  });

  describe('EvaluationScoreCategory', () => {
    it('should have 3 members', () => {
      expect(Object.values(EvaluationScoreCategory)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(EvaluationScoreCategory.TECHNICAL).toBe('technical');
      expect(EvaluationScoreCategory.BRAND).toBe('brand');
      expect(EvaluationScoreCategory.ENGAGEMENT).toBe('engagement');
    });
  });
});
