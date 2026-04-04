import { IngredientCategory } from '@genfeedai/enums';

/**
 * Normalizes a category string or enum value to IngredientCategory.
 */
export function normalizeCategory(
  category: IngredientCategory | string,
): IngredientCategory {
  return (
    typeof category === 'string' ? category : category
  ) as IngredientCategory;
}

/**
 * Converts a category to its string representation.
 */
export function categoryToString(
  category: IngredientCategory | string,
): string {
  return String(category);
}

/**
 * Converts a category to its plural form used in URL paths and S3 keys.
 * e.g., "video" → "videos", "image" → "images", "music" → "musics"
 */
export function categoryToPlural(
  category: IngredientCategory | string,
): string {
  return `${String(category)}s`;
}

/**
 * Converts a category to a media type string used in CDN URLs and notifications.
 * Returns 'image', 'video', or 'music'.
 */
export function categoryToMediaType(
  category: IngredientCategory | string,
): 'image' | 'video' | 'music' {
  const categoryStr = String(category);

  if (categoryStr === String(IngredientCategory.VIDEO)) {
    return 'video';
  }
  if (categoryStr === String(IngredientCategory.MUSIC)) {
    return 'music';
  }
  return 'image';
}
