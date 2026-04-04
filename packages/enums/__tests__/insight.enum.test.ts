import { describe, expect, it } from 'vitest';
import {
  AnomalySeverity,
  ContentSuggestionType,
  InsightCategory,
  InsightImpact,
  SmartAlertSeverity,
  SmartAlertType,
} from '../src/insight.enum';

describe('insight.enum', () => {
  describe('InsightCategory', () => {
    it('should have 4 members', () => {
      expect(Object.values(InsightCategory)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(InsightCategory.TREND).toBe('trend');
      expect(InsightCategory.OPPORTUNITY).toBe('opportunity');
      expect(InsightCategory.WARNING).toBe('warning');
      expect(InsightCategory.TIP).toBe('tip');
    });
  });

  describe('InsightImpact', () => {
    it('should have 3 members', () => {
      expect(Object.values(InsightImpact)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(InsightImpact.HIGH).toBe('high');
      expect(InsightImpact.MEDIUM).toBe('medium');
      expect(InsightImpact.LOW).toBe('low');
    });
  });

  describe('ContentSuggestionType', () => {
    it('should have 5 members', () => {
      expect(Object.values(ContentSuggestionType)).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(ContentSuggestionType.TIMING).toBe('timing');
      expect(ContentSuggestionType.FORMAT).toBe('format');
      expect(ContentSuggestionType.TOPIC).toBe('topic');
      expect(ContentSuggestionType.HASHTAG).toBe('hashtag');
      expect(ContentSuggestionType.LENGTH).toBe('length');
    });
  });

  describe('SmartAlertType', () => {
    it('should have 4 members', () => {
      expect(Object.values(SmartAlertType)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(SmartAlertType.ANOMALY).toBe('anomaly');
      expect(SmartAlertType.MILESTONE).toBe('milestone');
      expect(SmartAlertType.TREND).toBe('trend');
      expect(SmartAlertType.OPPORTUNITY).toBe('opportunity');
    });
  });

  describe('SmartAlertSeverity', () => {
    it('should have 4 members', () => {
      expect(Object.values(SmartAlertSeverity)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(SmartAlertSeverity.CRITICAL).toBe('critical');
      expect(SmartAlertSeverity.WARNING).toBe('warning');
      expect(SmartAlertSeverity.INFO).toBe('info');
      expect(SmartAlertSeverity.SUCCESS).toBe('success');
    });
  });

  describe('AnomalySeverity', () => {
    it('should have 3 members', () => {
      expect(Object.values(AnomalySeverity)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(AnomalySeverity.CRITICAL).toBe('critical');
      expect(AnomalySeverity.WARNING).toBe('warning');
      expect(AnomalySeverity.INFO).toBe('info');
    });
  });
});
