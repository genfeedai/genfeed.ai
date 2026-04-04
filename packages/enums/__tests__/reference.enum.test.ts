import { describe, expect, it } from 'vitest';
import { ReferenceSource } from '../src/reference.enum';

describe('reference.enum', () => {
  describe('ReferenceSource', () => {
    it('should have 1 members', () => {
      expect(Object.values(ReferenceSource)).toHaveLength(1);
    });

    it('should have correct values', () => {
      expect(ReferenceSource.BRAND).toBe('brand');
    });
  });
});
