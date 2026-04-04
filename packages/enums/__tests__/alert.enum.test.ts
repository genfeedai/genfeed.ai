import { describe, expect, it } from 'vitest';
import { AlertCategory } from '../src/alert.enum';

describe('alert.enum', () => {
  describe('AlertCategory', () => {
    it('should have 4 members', () => {
      expect(Object.values(AlertCategory)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(AlertCategory.INFO).toBe('info');
      expect(AlertCategory.SUCCESS).toBe('success');
      expect(AlertCategory.WARNING).toBe('warning');
      expect(AlertCategory.ERROR).toBe('error');
    });
  });
});
