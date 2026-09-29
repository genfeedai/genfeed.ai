import { describe, expect, it } from 'vitest';
import { Severity } from '../../src/enums/severity.enum';

describe('severity.enum', () => {
  describe('Severity', () => {
    it('should have correct values', () => {
      expect(Severity.LOW).toBe('low');
      expect(Severity.MEDIUM).toBe('medium');
      expect(Severity.HIGH).toBe('high');
      expect(Severity.CRITICAL).toBe('critical');
    });
  });
});
