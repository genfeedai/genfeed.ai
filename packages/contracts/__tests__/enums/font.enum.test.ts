import { describe, expect, it } from 'vitest';
import { FontFamily } from '../../src/enums/font.enum';

describe('font.enum', () => {
  describe('FontFamily', () => {
    it('should have 3 members', () => {
      expect(Object.values(FontFamily)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(FontFamily.MONTSERRAT_BLACK).toBe('MONTSERRAT_BLACK');
      expect(FontFamily.MONTSERRAT_BOLD).toBe('MONTSERRAT_BOLD');
      expect(FontFamily.MONTSERRAT_REGULAR).toBe('MONTSERRAT_REGULAR');
    });
  });
});
