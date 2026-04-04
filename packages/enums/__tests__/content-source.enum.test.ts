import { describe, expect, it } from 'vitest';
import { AlertFrequency, ContentSourceType } from '../src/content-source.enum';

describe('content-source.enum', () => {
  describe('AlertFrequency', () => {
    it('should have 3 members', () => {
      expect(Object.values(AlertFrequency)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(AlertFrequency.INSTANT).toBe('instant');
      expect(AlertFrequency.HOURLY).toBe('hourly');
      expect(AlertFrequency.DAILY).toBe('daily');
    });
  });

  describe('ContentSourceType', () => {
    it('should have 3 members', () => {
      expect(Object.values(ContentSourceType)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(ContentSourceType.QUEUE).toBe('queue');
      expect(ContentSourceType.TEMPLATE).toBe('template');
      expect(ContentSourceType.AI_GENERATED).toBe('ai_generated');
    });
  });
});
