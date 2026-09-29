import { describe, expect, it } from 'vitest';
import { ReferenceSource } from '../../src/enums/reference.enum';

describe('reference.enum', () => {
  describe('ReferenceSource', () => {
    it('should have correct values', () => {
      expect(ReferenceSource.BRAND).toBe('brand');
    });
  });
});
