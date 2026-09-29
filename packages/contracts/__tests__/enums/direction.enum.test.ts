import { describe, expect, it } from 'vitest';
import {
  DropdownDirection,
  ScrollDirection,
  TrendDirection,
} from '../../src/enums/direction.enum';

describe('direction.enum', () => {
  describe('TrendDirection', () => {
    it('should have correct values', () => {
      expect(TrendDirection.UP).toBe('up');
      expect(TrendDirection.DOWN).toBe('down');
      expect(TrendDirection.STABLE).toBe('stable');
    });
  });

  describe('ScrollDirection', () => {
    it('should have correct values', () => {
      expect(ScrollDirection.LEFT).toBe('left');
      expect(ScrollDirection.RIGHT).toBe('right');
    });
  });

  describe('DropdownDirection', () => {
    it('should have correct values', () => {
      expect(DropdownDirection.UP).toBe('up');
      expect(DropdownDirection.DOWN).toBe('down');
    });
  });
});
