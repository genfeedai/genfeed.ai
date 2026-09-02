import type { AssetCategory } from './asset.enum';
import { IngredientCategory } from './ingredient.enum';

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
 * → "images", IngredientCategory.MUSIC → "musics", AssetCategory.LOGO → "logos"
 *
 * The lower-casing is load-bearing: category enums are SCREAMING_SNAKE to match
 * their Prisma labels, while the storage/URL convention is lowercase plural.
 * Interpolating a raw category into a key yields `IMAGEs/` or `LOGOs/`, which
 * addresses nothing — always route S3 keys and CDN paths through this helper.
 *
 * @see .agents/memory/rules/enum_source_of_truth.md
 */
export function categoryToPlural(
  category: AssetCategory | IngredientCategory | string,
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
