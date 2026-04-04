import { IngredientFormat } from '@genfeedai/enums';
import { resolveIngredientAspectRatio } from '@helpers/formatting/aspect-ratio/aspect-ratio.util';
import { describe, expect, it } from 'vitest';

describe('aspect-ratio.util', () => {
  describe('resolveIngredientAspectRatio', () => {
    it('should return PORTRAIT for null source', () => {
      expect(resolveIngredientAspectRatio(null)).toBe(
        IngredientFormat.PORTRAIT,
      );
    });

    it('should return PORTRAIT for undefined source', () => {
      expect(resolveIngredientAspectRatio(undefined)).toBe(
        IngredientFormat.PORTRAIT,
      );
    });

    it('should return LANDSCAPE for empty object (no dimensions default to 16:9)', () => {
      expect(resolveIngredientAspectRatio({})).toBe(IngredientFormat.LANDSCAPE);
    });

    it('should return SQUARE for 1:1 ratio (equal width and height)', () => {
      expect(resolveIngredientAspectRatio({ height: 1080, width: 1080 })).toBe(
        IngredientFormat.SQUARE,
      );
    });

    it('should return SQUARE for 1:1 ratio using metadata', () => {
      expect(
        resolveIngredientAspectRatio({
          metadata: { height: 500, width: 500 },
        }),
      ).toBe(IngredientFormat.SQUARE);
    });

    it('should return PORTRAIT for 9:16 ratio', () => {
      expect(resolveIngredientAspectRatio({ height: 1920, width: 1080 })).toBe(
        IngredientFormat.PORTRAIT,
      );
    });

    it('should return PORTRAIT for 3:4 ratio', () => {
      expect(resolveIngredientAspectRatio({ height: 1024, width: 768 })).toBe(
        IngredientFormat.PORTRAIT,
      );
    });

    it('should return PORTRAIT for 2:3 ratio', () => {
      expect(resolveIngredientAspectRatio({ height: 1200, width: 800 })).toBe(
        IngredientFormat.PORTRAIT,
      );
    });

    it('should return PORTRAIT for 4:5 ratio', () => {
      expect(resolveIngredientAspectRatio({ height: 1350, width: 1080 })).toBe(
        IngredientFormat.PORTRAIT,
      );
    });

    it('should return LANDSCAPE for 16:9 ratio', () => {
      expect(resolveIngredientAspectRatio({ height: 1080, width: 1920 })).toBe(
        IngredientFormat.LANDSCAPE,
      );
    });

    it('should return LANDSCAPE for 4:3 ratio', () => {
      expect(resolveIngredientAspectRatio({ height: 768, width: 1024 })).toBe(
        IngredientFormat.LANDSCAPE,
      );
    });

    it('should prefer metadata object over direct width/height', () => {
      expect(
        resolveIngredientAspectRatio({
          height: 1080,
          metadata: { height: 1080, width: 1080 },
          width: 1920,
        }),
      ).toBe(IngredientFormat.SQUARE);
    });

    it('should fall back to metadataWidth/metadataHeight', () => {
      expect(
        resolveIngredientAspectRatio({
          metadataHeight: 1080,
          metadataWidth: 1080,
        }),
      ).toBe(IngredientFormat.SQUARE);
    });

    it('should return LANDSCAPE for zero width (defaults to 16:9)', () => {
      expect(resolveIngredientAspectRatio({ height: 1080, width: 0 })).toBe(
        IngredientFormat.LANDSCAPE,
      );
    });

    it('should return LANDSCAPE for zero height (defaults to 16:9)', () => {
      expect(resolveIngredientAspectRatio({ height: 0, width: 1080 })).toBe(
        IngredientFormat.LANDSCAPE,
      );
    });

    it('should handle negative dimensions gracefully', () => {
      expect(resolveIngredientAspectRatio({ height: 100, width: -100 })).toBe(
        IngredientFormat.PORTRAIT,
      );
    });

    it('should return LANDSCAPE for wide non-standard ratio', () => {
      expect(resolveIngredientAspectRatio({ height: 1080, width: 2560 })).toBe(
        IngredientFormat.LANDSCAPE,
      );
    });
  });
});
