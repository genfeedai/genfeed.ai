import { IngredientCategory } from '@genfeedai/contracts';
import { MAX_PAGE_SIZE } from '@genfeedai/contracts/constants';
import type { StudioPlaygroundJob } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import type { Ingredient } from '@genfeedai/models/content/ingredient.model';
import type { StudioPlaygroundFilter } from '@genfeedai/props/studio/studio-playground.props';
import {
  getStudioPlaygroundTypeConfig,
  STUDIO_PLAYGROUND_TYPES,
} from '@pages/studio/playground/utils/studio-playground-types';
import type { IngredientsService } from '@services/content/ingredients.service';

/** Recent-result capacity retained per output category. */
export const STUDIO_GALLERY_PAGE_SIZE = 24;

/** Relationships are only the persisted identities already loaded in this gallery. */
export function resolveFocusedStudioJobs(
  selected: StudioPlaygroundJob,
  jobs: readonly StudioPlaygroundJob[],
) {
  const available = jobs.filter((job) => !job.ingredient?.isDeleted);
  const sourceId = selected.ingredientId ?? selected.id;
  const parentId = selected.parentId ?? selected.ingredient?.parentId;
  const related = available.filter((job) => {
    const id = job.ingredientId ?? job.id;
    const parent = job.parentId ?? job.ingredient?.parentId;
    return (
      job.id === selected.id ||
      Boolean(selected.runId && job.runId === selected.runId) ||
      parent === sourceId ||
      Boolean(parentId && (id === parentId || parent === parentId))
    );
  });
  const relatedIds = new Set(related.map((job) => job.id));
  return {
    related,
    recent: available.filter((job) => !relatedIds.has(job.id)).slice(0, 12),
  };
}

export type { StudioPlaygroundFilter };

/**
 * Persisted output categories for the active results filter. Avatar generation
 * produces a video ingredient, so Avatar and Video intentionally share the
 * same stored category. `all` also loads GIFs made from a Generate video.
 */
export function resolveStudioGalleryCategories(
  filter: StudioPlaygroundFilter,
): readonly IngredientCategory[] {
  if (filter === 'all') {
    return Array.from(
      new Set([
        ...STUDIO_PLAYGROUND_TYPES.map((type) =>
          type === 'avatar'
            ? IngredientCategory.VIDEO
            : getStudioPlaygroundTypeConfig(type).ingredientCategory,
        ),
        IngredientCategory.GIF,
      ]),
    );
  }

  return [
    filter === 'avatar'
      ? IngredientCategory.VIDEO
      : getStudioPlaygroundTypeConfig(filter).ingredientCategory,
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
  filter: StudioPlaygroundFilter,
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
  filter: StudioPlaygroundFilter,
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
