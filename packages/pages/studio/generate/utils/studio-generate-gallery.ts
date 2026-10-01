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

const GALLERY_HANDLED_STATUSES = [408, 429, 500, 502, 503, 504] as const;

/**
 * Brand-scoped, newest-first query for one output category.
 * The All filter must not multiply 24 by the category count: that request
 * asked for 120 rows and the API rejects limits above 100. Pass one category
 * so every request stays at {@link STUDIO_GALLERY_PAGE_SIZE}.
 */
export function buildStudioGalleryQuery(
  brandId: string,
  filter: StudioGenerateFilter,
  limit: number = STUDIO_GALLERY_PAGE_SIZE,
  category?: IngredientCategory,
): Record<string, unknown> {
  const categories = category
    ? [category]
    : resolveStudioGalleryCategories(filter);
  const query: Record<string, unknown> = {
    categories,
    limit: Math.min(MAX_PAGE_SIZE, limit),
    sort: 'createdAt: -1',
  };

  if (brandId) {
    query.brandId = brandId;
  }

  return query;
}

/**
 * One page of 24 ingredients per output category. All is five requests, not
 * one request whose limit is 24 times the category count.
 */
export async function loadStudioGalleryIngredients(
  service: Pick<IngredientsService, 'findAllPage'>,
  brandId: string,
  filter: StudioGenerateFilter,
  signal: AbortSignal,
): Promise<Ingredient[]> {
  if (!brandId) return [];
  const categories = resolveStudioGalleryCategories(filter);
  signal.throwIfAborted();
  // These independent reads are bounded to the five persisted categories.
  // Publish only after every page succeeds, in category order, so a failure
  // cannot expose partial history and network timing cannot affect deduping.
  const results = await Promise.all(
    categories.map((category) => {
      const query = buildStudioGalleryQuery(
        brandId,
        filter,
        STUDIO_GALLERY_PAGE_SIZE,
        category,
      );
      return service.findAllPage({ ...query, page: 1 }, signal, {
        handledErrorStatuses: [...GALLERY_HANDLED_STATUSES],
      });
    }),
  );
  signal.throwIfAborted();
  const collected = new Map<string, Ingredient>();
  for (const result of results) {
    for (const ingredient of result.items.slice(0, STUDIO_GALLERY_PAGE_SIZE))
      collected.set(ingredient.id, ingredient);
  }
  return [...collected.values()].slice(
    0,
    STUDIO_GALLERY_PAGE_SIZE * categories.length,
  );
}
