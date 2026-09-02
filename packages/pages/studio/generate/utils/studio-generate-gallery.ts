import { IngredientCategory } from '@genfeedai/contracts';
import type { StudioGenerateFilter } from '@genfeedai/props/studio/studio-generate.props';
import {
  getStudioGenerateTypeConfig,
  STUDIO_GENERATE_TYPES,
} from '@pages/studio/generate/utils/studio-generate-types';

/** Recent-result capacity retained per output category. */
export const STUDIO_GALLERY_PAGE_SIZE = 24;

export type { StudioGenerateFilter };

/**
 * Persisted output categories for the active results filter. Avatar generation
 * produces a video ingredient, so Avatar and Video intentionally share the
 * same stored category.
 */
export function resolveStudioGalleryCategories(
  filter: StudioGenerateFilter,
): readonly IngredientCategory[] {
  if (filter === 'all') {
    return Array.from(
      new Set(
        STUDIO_GENERATE_TYPES.map((type) =>
          type === 'avatar'
            ? IngredientCategory.VIDEO
            : getStudioGenerateTypeConfig(type).ingredientCategory,
        ),
      ),
    );
  }

  return [
    filter === 'avatar'
      ? IngredientCategory.VIDEO
      : getStudioGenerateTypeConfig(filter).ingredientCategory,
  ];
}

/**
 * Brand-scoped, newest-first query for the unified ingredients collection.
 * That endpoint hydrates metadata and prompt relations, unlike the reduced
 * category list endpoints. `brandId` is omitted until the selected brand is
 * resolved, and the hook does not issue that widened request.
 */
export function buildStudioGalleryQuery(
  brandId: string,
  filter: StudioGenerateFilter,
  limit: number = STUDIO_GALLERY_PAGE_SIZE,
): Record<string, unknown> {
  const categories = resolveStudioGalleryCategories(filter);
  const query: Record<string, unknown> = {
    categories,
    // The previous category requests each returned `limit` rows. Preserve that
    // total history capacity while loading one hydrated collection response.
    limit: limit * categories.length,
    sort: 'createdAt: -1',
  };

  if (brandId) {
    query.brandId = brandId;
  }

  return query;
}
