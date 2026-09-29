import { describe, expect, it } from 'vitest';
import { AlertCategory } from '../../src/enums/alert.enum';

describe('alert.enum', () => {
  describe('AlertCategory', () => {
    it('should have correct values', () => {
      expect(AlertCategory.INFO).toBe('info');
      expect(AlertCategory.SUCCESS).toBe('success');
      expect(AlertCategory.WARNING).toBe('warning');
      expect(AlertCategory.ERROR).toBe('error');
    });
  });
});
