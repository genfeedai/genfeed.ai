import {
  categoryToMediaType,
  categoryToPlural,
  categoryToString,
  IngredientCategory,
  normalizeCategory,
} from '../../src';

describe('ingredient-category.util', () => {
  describe('normalizeCategory', () => {
    it('returns the enum value for a lower-cased string input', () => {
      expect(normalizeCategory('video')).toBe(IngredientCategory.VIDEO);
    });

    it('returns the enum value for enum input', () => {
      expect(normalizeCategory(IngredientCategory.IMAGE)).toBe(
        IngredientCategory.IMAGE,
      );
    });
  });

  describe('categoryToString', () => {
    it('lower-cases an enum member', () => {
      expect(categoryToString(IngredientCategory.VIDEO)).toBe('video');
    });

    it('passes through already-lowercase string values', () => {
      expect(categoryToString('image')).toBe('image');
    });
  });

  describe('categoryToPlural', () => {
    it('pluralizes video', () => {
      expect(categoryToPlural(IngredientCategory.VIDEO)).toBe('videos');
    });

    it('pluralizes image', () => {
      expect(categoryToPlural(IngredientCategory.IMAGE)).toBe('images');
    });

    it('pluralizes music', () => {
      expect(categoryToPlural(IngredientCategory.MUSIC)).toBe('musics');
    });

    it('handles string input', () => {
      expect(categoryToPlural('video')).toBe('videos');
    });

    // The regression this helper exists to prevent: IngredientCategory labels
    // are SCREAMING_SNAKE, but every upload writes to a lower-cased plural
    // folder. A raw `${category}s` interpolation produced `IMAGEs/`, which
    // addressed no existing S3 key.
    it('lower-cases every SCREAMING_SNAKE member, never emitting a mixed-case folder', () => {
      for (const category of Object.values(IngredientCategory)) {
        const plural = categoryToPlural(category);

        expect(plural).toBe(plural.toLowerCase());
        expect(plural).toBe(`${String(category).toLowerCase()}s`);
      }
    });
  });

  describe('categoryToMediaType', () => {
    it('returns "video" for VIDEO', () => {
      expect(categoryToMediaType(IngredientCategory.VIDEO)).toBe('video');
    });

    it('returns "music" for MUSIC', () => {
      expect(categoryToMediaType(IngredientCategory.MUSIC)).toBe('music');
    });

    it('returns "image" for IMAGE', () => {
      expect(categoryToMediaType(IngredientCategory.IMAGE)).toBe('image');
    });

    it('defaults to "image" for unknown categories', () => {
      expect(categoryToMediaType('gif')).toBe('image');
    });

    it('handles string input', () => {
      expect(categoryToMediaType('video')).toBe('video');
    });
  });
});
