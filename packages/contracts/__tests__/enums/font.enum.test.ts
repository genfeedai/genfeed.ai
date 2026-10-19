import { describe, expect, it } from 'vitest';
import {
  FONT_FAMILY_METADATA,
  FontFamily,
  resolveFontFamily,
} from '../../src/enums/font.enum';

describe('font.enum', () => {
  describe('FontFamily', () => {
    it('should keep the original Montserrat values', () => {
      expect(FontFamily.MONTSERRAT_BLACK).toBe('MONTSERRAT_BLACK');
      expect(FontFamily.MONTSERRAT_BOLD).toBe('MONTSERRAT_BOLD');
      expect(FontFamily.MONTSERRAT_REGULAR).toBe('MONTSERRAT_REGULAR');
    });

    it('should include the Google font members', () => {
      expect(Object.values(FontFamily)).toEqual(
        expect.arrayContaining([
          'INTER_BOLD',
          'POPPINS_BOLD',
          'BEBAS_NEUE',
          'ANTON',
          'ARCHIVO_BLACK',
          'BANGERS',
        ]),
      );
    });
  });

  describe('FONT_FAMILY_METADATA', () => {
    it('should describe every member with a key matching its label', () => {
      for (const font of Object.values(FontFamily)) {
        const metadata = FONT_FAMILY_METADATA[font];
        expect(metadata.key).toBe(font.toLowerCase().replaceAll('_', '-'));
        expect(metadata.label).toBeTruthy();
        expect(metadata.cssFamily).toBeTruthy();
      }
    });
  });

  describe('resolveFontFamily', () => {
    it('should resolve enum values and lowercase-hyphen keys', () => {
      expect(resolveFontFamily('POPPINS_BOLD')).toBe(FontFamily.POPPINS_BOLD);
      expect(resolveFontFamily('bebas-neue')).toBe(FontFamily.BEBAS_NEUE);
    });

    it('should reject unknown fonts', () => {
      expect(resolveFontFamily('comic-sans')).toBeUndefined();
      expect(resolveFontFamily('../../etc/passwd')).toBeUndefined();
      expect(resolveFontFamily(undefined)).toBeUndefined();
    });
  });
});
