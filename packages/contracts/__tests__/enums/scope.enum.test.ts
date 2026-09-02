import { describe, expect, it } from 'vitest';
import { Scope } from '../../src/enums/scope.enum';

describe('scope.enum', () => {
  describe('Scope', () => {
    it('should have 4 members', () => {
      expect(Object.values(Scope)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(Scope.USER).toBe('USER');
      expect(Scope.BRAND).toBe('BRAND');
      expect(Scope.ORGANIZATION).toBe('ORGANIZATION');
      expect(Scope.PUBLIC).toBe('PUBLIC');
    });
  });
});
