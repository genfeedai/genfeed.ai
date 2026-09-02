import {
  IngredientCategory,
  isIngredientCategory,
  parseIngredientCategory,
} from '../../src';

describe('ingredient.util', () => {
  it('parses enum members as identity', () => {
    expect(parseIngredientCategory(IngredientCategory.VIDEO)).toBe(
      IngredientCategory.VIDEO,
    );
    expect(parseIngredientCategory('IMAGE_EDIT')).toBe(
      IngredientCategory.IMAGE_EDIT,
    );
  });

  it('parses the lowercase route spellings the library URLs use', () => {
    expect(parseIngredientCategory('video')).toBe(IngredientCategory.VIDEO);
    expect(parseIngredientCategory('image')).toBe(IngredientCategory.IMAGE);
    expect(parseIngredientCategory('gif')).toBe(IngredientCategory.GIF);
    expect(parseIngredientCategory('voice')).toBe(IngredientCategory.VOICE);
    expect(parseIngredientCategory('music')).toBe(IngredientCategory.MUSIC);
    expect(parseIngredientCategory('avatar')).toBe(IngredientCategory.AVATAR);
  });

  it('parses hyphenated legacy spellings', () => {
    expect(parseIngredientCategory('image-edit')).toBe(
      IngredientCategory.IMAGE_EDIT,
    );
    expect(parseIngredientCategory(' video-edit ')).toBe(
      IngredientCategory.VIDEO_EDIT,
    );
  });

  it('returns undefined for anything that is not a category', () => {
    expect(parseIngredientCategory('widget')).toBeUndefined();
    expect(parseIngredientCategory('')).toBeUndefined();
    expect(parseIngredientCategory(null)).toBeUndefined();
    expect(parseIngredientCategory(undefined)).toBeUndefined();
    expect(parseIngredientCategory(42)).toBeUndefined();
  });

  it('narrows with isIngredientCategory', () => {
    expect(isIngredientCategory(IngredientCategory.SOURCE)).toBe(true);
    expect(isIngredientCategory('source')).toBe(false);
    expect(isIngredientCategory(null)).toBe(false);
  });
});
