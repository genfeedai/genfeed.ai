import { describe, expect, it } from 'vitest';
import { FontFamily } from '../../src/enums/font.enum';

describe('font.enum', () => {
  describe('FontFamily', () => {
    it('should have correct values', () => {
      expect(FontFamily.MONTSERRAT_BLACK).toBe('MONTSERRAT_BLACK');
      expect(FontFamily.MONTSERRAT_BOLD).toBe('MONTSERRAT_BOLD');
      expect(FontFamily.MONTSERRAT_REGULAR).toBe('MONTSERRAT_REGULAR');
    });
  });
});
