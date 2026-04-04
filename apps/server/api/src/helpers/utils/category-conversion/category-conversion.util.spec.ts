import {
  categoryToMediaType,
  categoryToPlural,
  categoryToString,
  normalizeCategory,
} from '@api/helpers/utils/category-conversion/category-conversion.util';
import { IngredientCategory } from '@genfeedai/enums';

describe('CategoryConversionUtil', () => {
  describe('normalizeCategory', () => {
    it('should return enum value for string input', () => {
      expect(normalizeCategory('video')).toBe(IngredientCategory.VIDEO);
    });

    it('should return enum value for enum input', () => {
      expect(normalizeCategory(IngredientCategory.IMAGE)).toBe(
        IngredientCategory.IMAGE,
      );
    });
  });

  describe('categoryToString', () => {
    it('should convert enum to string', () => {
      expect(categoryToString(IngredientCategory.VIDEO)).toBe('video');
    });

    it('should pass through string values', () => {
      expect(categoryToString('image')).toBe('image');
    });
  });

  describe('categoryToPlural', () => {
    it('should pluralize video', () => {
      expect(categoryToPlural(IngredientCategory.VIDEO)).toBe('videos');
    });

    it('should pluralize image', () => {
      expect(categoryToPlural(IngredientCategory.IMAGE)).toBe('images');
    });

    it('should pluralize music', () => {
      expect(categoryToPlural(IngredientCategory.MUSIC)).toBe('musics');
    });

    it('should handle string input', () => {
      expect(categoryToPlural('video')).toBe('videos');
    });
  });

  describe('categoryToMediaType', () => {
    it('should return "video" for VIDEO category', () => {
      expect(categoryToMediaType(IngredientCategory.VIDEO)).toBe('video');
    });

    it('should return "music" for MUSIC category', () => {
      expect(categoryToMediaType(IngredientCategory.MUSIC)).toBe('music');
    });

    it('should return "image" for IMAGE category', () => {
      expect(categoryToMediaType(IngredientCategory.IMAGE)).toBe('image');
    });

    it('should default to "image" for unknown categories', () => {
      expect(categoryToMediaType('gif')).toBe('image');
    });

    it('should handle string input', () => {
      expect(categoryToMediaType('video')).toBe('video');
    });
  });
});
