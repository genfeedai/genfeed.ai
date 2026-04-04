import { describe, expect, it } from 'vitest';
import { Priority } from '../src/priority.enum';

describe('priority.enum', () => {
  describe('Priority', () => {
    it('should have 3 members', () => {
      expect(Object.values(Priority)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(Priority.LOW).toBe('low');
      expect(Priority.MEDIUM).toBe('medium');
      expect(Priority.HIGH).toBe('high');
    });
  });
});
