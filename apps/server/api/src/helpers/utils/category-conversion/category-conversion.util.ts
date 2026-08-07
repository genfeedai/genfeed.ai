import { IngredientCategory } from '@genfeedai/enums';

/**
 * Normalizes a category string or enum value to IngredientCategory,
 * matching case-insensitively against the known enum members.
 * Unrecognized values are upper-cased and returned as-is.
 */
export function normalizeCategory(
  category: IngredientCategory | string,
): IngredientCategory {
  const upperCased = String(category).toUpperCase();
  const match = Object.values(IngredientCategory).find(
    (value) => value === upperCased,
  );

  return (match ?? upperCased) as IngredientCategory;
}

/**
 * Converts a category to its lower-cased string representation.
 */
export function categoryToString(
  category: IngredientCategory | string,
): string {
  return String(category).toLowerCase();
}

/**
 * Converts a category to its plural form used in URL paths, cache tags, and
 * S3 keys. e.g., IngredientCategory.VIDEO → "videos", IngredientCategory.IMAGE
 * → "images", IngredientCategory.MUSIC → "musics"
 */
export function categoryToPlural(
  category: IngredientCategory | string,
): string {
  return `${String(category).toLowerCase()}s`;
}

/**
 * Converts a category to a media type string used in CDN URLs and notifications.
 * Returns 'image', 'video', or 'music'.
 */
export function categoryToMediaType(
  category: IngredientCategory | string,
): 'image' | 'video' | 'music' {
  const categoryStr = String(category).toUpperCase();

  if (categoryStr === String(IngredientCategory.VIDEO)) {
    return 'video';
  }
  if (categoryStr === String(IngredientCategory.MUSIC)) {
    return 'music';
  }
  return 'image';
}
