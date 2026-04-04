import { describe, expect, it } from 'vitest';
import { ComponentSize } from '../src/component-size.enum';

describe('component-size.enum', () => {
  describe('ComponentSize', () => {
    it('should have 5 members', () => {
      expect(Object.values(ComponentSize)).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(ComponentSize.XS).toBe('xs');
      expect(ComponentSize.SM).toBe('sm');
      expect(ComponentSize.MD).toBe('md');
      expect(ComponentSize.LG).toBe('lg');
      expect(ComponentSize.XL).toBe('xl');
    });
  });
});
