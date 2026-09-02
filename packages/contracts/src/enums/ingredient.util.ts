import { IngredientCategory } from './ingredient.enum';

const INGREDIENT_CATEGORY_VALUES = new Set<string>(
  Object.values(IngredientCategory),
);

export function isIngredientCategory(
  value: unknown,
): value is IngredientCategory {
  return typeof value === 'string' && INGREDIENT_CATEGORY_VALUES.has(value);
}

/**
 * Parse free text into a canonical {@link IngredientCategory}.
 *
 * Library routes are lowercase product language (`/library/videos`,
 * `/library/images`), so the singular derived from the segment is `video`, not
 * the enum member. Since `IngredientCategory` was harmonized to Prisma's
 * SCREAMING_SNAKE labels (#2473), that raw segment no longer equals any member —
 * comparisons against it are silently false and it fails `@IsEnum` server-side.
 * Normalize the route value here rather than comparing raw strings.
 *
 * Accepts enum members (identity), lowercase (`video`), and hyphen spellings
 * (`image-edit`). Returns `undefined` for anything else — callers decide the
 * fallback.
 */
export function parseIngredientCategory(
  value: unknown,
): IngredientCategory | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().replace(/-/g, '_').toUpperCase();
  if (!normalized || !INGREDIENT_CATEGORY_VALUES.has(normalized)) {
    return undefined;
  }

  return normalized as IngredientCategory;
}
