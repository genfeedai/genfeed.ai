import { describe, expect, it } from 'vitest';
import { FontFamily } from '../src/font.enum';

describe('font.enum', () => {
  describe('FontFamily', () => {
    it('should have 3 members', () => {
      expect(Object.values(FontFamily)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(FontFamily.MONTSERRAT_BLACK).toBe('montserrat-black');
      expect(FontFamily.MONTSERRAT_BOLD).toBe('montserrat-bold');
      expect(FontFamily.MONTSERRAT_REGULAR).toBe('montserrat-regular');
    });
  });
});
