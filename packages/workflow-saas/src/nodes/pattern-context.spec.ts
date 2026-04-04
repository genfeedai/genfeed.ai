import { describe, expect, it } from 'vitest';
import { DEFAULT_PATTERN_CONTEXT_DATA } from './pattern-context';

describe('pattern-context node', () => {
  describe('DEFAULT_PATTERN_CONTEXT_DATA', () => {
    it('should have label set to Pattern Context', () => {
      expect(DEFAULT_PATTERN_CONTEXT_DATA.label).toBe('Pattern Context');
    });

    it('should default to idle status', () => {
      expect(DEFAULT_PATTERN_CONTEXT_DATA.status).toBe('idle');
    });

    it('should default brandId to null', () => {
      expect(DEFAULT_PATTERN_CONTEXT_DATA.brandId).toBeNull();
    });

    it('should default limit to 10', () => {
      expect(DEFAULT_PATTERN_CONTEXT_DATA.limit).toBe(10);
    });

    it('should default patternTypes to empty array', () => {
      expect(DEFAULT_PATTERN_CONTEXT_DATA.patternTypes).toEqual([]);
    });

    it('should default patterns to empty array', () => {
      expect(DEFAULT_PATTERN_CONTEXT_DATA.patterns).toEqual([]);
    });

    it('should default jobId to null', () => {
      expect(DEFAULT_PATTERN_CONTEXT_DATA.jobId).toBeNull();
    });
  });
});
