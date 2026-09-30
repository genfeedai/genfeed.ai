import { IngredientCategory } from '@genfeedai/contracts';
import { MAX_PAGE_SIZE } from '@genfeedai/contracts/constants';
import type { Ingredient } from '@genfeedai/models/content/ingredient.model';
import type { StudioGenerateFilter } from '@genfeedai/props/studio/studio-generate.props';
import {
  getStudioGenerateTypeConfig,
  STUDIO_GENERATE_TYPES,
} from '@pages/studio/generate/utils/studio-generate-types';
import type { IngredientsService } from '@services/content/ingredients.service';

/** Recent-result capacity retained per output category. */
export const STUDIO_GALLERY_PAGE_SIZE = 24;

export type { StudioGenerateFilter };

/**
 * Persisted output categories for the active results filter. Avatar generation
 * produces a video ingredient, so Avatar and Video intentionally share the
 * same stored category. `all` also loads GIFs made from a Generate video.
 */
export function resolveStudioGalleryCategories(
  filter: StudioGenerateFilter,
): readonly IngredientCategory[] {
  if (filter === 'all') {
    return Array.from(
      new Set([
        ...STUDIO_GENERATE_TYPES.map((type) =>
          type === 'avatar'
            ? IngredientCategory.VIDEO
            : getStudioGenerateTypeConfig(type).ingredientCategory,
        ),
        IngredientCategory.GIF,
      ]),
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
    limit: Math.min(MAX_PAGE_SIZE, limit * categories.length),
    sort: 'createdAt: -1',
  };

  if (brandId) {
    query.brandId = brandId;
  }

  return query;
}

/** Keep the recent-result capacity while respecting the API page boundary. */
export async function loadStudioGalleryIngredients(
  service: Pick<IngredientsService, 'findAllPage'>,
  brandId: string,
  filter: StudioGenerateFilter,
  signal: AbortSignal,
): Promise<Ingredient[]> {
  if (!brandId) return [];
  const capacity =
    STUDIO_GALLERY_PAGE_SIZE * resolveStudioGalleryCategories(filter).length;
  const query = buildStudioGalleryQuery(brandId, filter);
  const collected = new Map<string, Ingredient>();
  let page = 1;
  let totalPages = 1;
  do {
    signal.throwIfAborted();
    const result = await service.findAllPage({ ...query, page }, signal);
    for (const ingredient of result.items)
      collected.set(ingredient.id, ingredient);
    totalPages = result.totalPages;
    page += 1;
  } while (collected.size < capacity && page <= totalPages);
  return [...collected.values()].slice(0, capacity);
}
