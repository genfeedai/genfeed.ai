import { describe, expect, it } from 'vitest';
import { SortOrder } from '../src/sort.enum';

describe('sort.enum', () => {
  describe('SortOrder', () => {
    it('should have 2 members', () => {
      expect(Object.values(SortOrder)).toHaveLength(2);
    });

    it('should have correct values', () => {
      expect(SortOrder.ASC).toBe('asc');
      expect(SortOrder.DESC).toBe('desc');
    });
  });
});
