import { describe, expect, it } from 'vitest';
import { Scope } from '../src/scope.enum';

describe('scope.enum', () => {
  describe('Scope', () => {
    it('should have 4 members', () => {
      expect(Object.values(Scope)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(Scope.USER).toBe('user');
      expect(Scope.BRAND).toBe('brand');
      expect(Scope.ORGANIZATION).toBe('organization');
      expect(Scope.PUBLIC).toBe('public');
    });
  });
});
