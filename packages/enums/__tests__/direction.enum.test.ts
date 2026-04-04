import { describe, expect, it } from 'vitest';
import {
  DropdownDirection,
  ScrollDirection,
  TrendDirection,
} from '../src/direction.enum';

describe('direction.enum', () => {
  describe('TrendDirection', () => {
    it('should have 3 members', () => {
      expect(Object.values(TrendDirection)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(TrendDirection.UP).toBe('up');
      expect(TrendDirection.DOWN).toBe('down');
      expect(TrendDirection.STABLE).toBe('stable');
    });
  });

  describe('ScrollDirection', () => {
    it('should have 2 members', () => {
      expect(Object.values(ScrollDirection)).toHaveLength(2);
    });

    it('should have correct values', () => {
      expect(ScrollDirection.LEFT).toBe('left');
      expect(ScrollDirection.RIGHT).toBe('right');
    });
  });

  describe('DropdownDirection', () => {
    it('should have 2 members', () => {
      expect(Object.values(DropdownDirection)).toHaveLength(2);
    });

    it('should have correct values', () => {
      expect(DropdownDirection.UP).toBe('up');
      expect(DropdownDirection.DOWN).toBe('down');
    });
  });
});
