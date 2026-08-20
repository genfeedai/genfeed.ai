import type { StudioGenerateFilter } from '@genfeedai/props/studio/studio-generate.props';
import {
  getStudioGenerateTypeConfig,
  STUDIO_GENERATE_TYPES,
} from '@pages/studio/generate/utils/studio-generate-types';

/** How many stored assets each collection contributes to the results grid. */
export const STUDIO_GALLERY_PAGE_SIZE = 24;

export type { StudioGenerateFilter };

/**
 * REST collection segments a given results filter has to read. Each ingredient
 * category lives behind its own collection endpoint, so `all` fans out rather
 * than passing a multi-valued `category` filter the API does not accept.
 */
export function resolveStudioGallerySegments(
  filter: StudioGenerateFilter,
): readonly string[] {
  if (filter === 'all') {
    // Avatar clips are persisted as videos, so both types point at `/videos`.
    // De-duplicate rather than paging the same collection twice.
    return Array.from(
      new Set(
        STUDIO_GENERATE_TYPES.map(
          (type) => getStudioGenerateTypeConfig(type).resourceSegment,
        ),
      ),
    );
  }

  return [getStudioGenerateTypeConfig(filter).resourceSegment];
}

/**
 * Brand-scoped, newest-first query for one collection. `brand` is omitted when
 * no brand is resolved yet so the request is never silently widened by an
 * `undefined` filter value.
 */
export function buildStudioGalleryQuery(
  brandId: string,
  limit: number = STUDIO_GALLERY_PAGE_SIZE,
): Record<string, unknown> {
  const query: Record<string, unknown> = {
    limit,
    sort: 'createdAt: -1',
  };

  if (brandId) {
    query.brand = brandId;
  }

  return query;
}
