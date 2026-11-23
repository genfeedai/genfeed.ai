import { CACHE_TAGS } from '@api/common/constants/cache-patterns.constants';
import type { CacheService } from '@api/services/cache/cache.service';

/** Brand fields whose change can take a brand out of the public view. */
const PUBLIC_VISIBILITY_FIELDS = [
  'isActive',
  'isDeleted',
  'organizationId',
  'scope',
] as const;

/**
 * Public brand and post responses are cached and a cache hit skips the
 * visibility query, so a brand that leaves PUBLIC (or is deactivated, deleted
 * or moved) must drop them. The invalidation is guarded: a response that was
 * being built before the change does not get stored afterwards.
 */
export function dropPublicBrandResponses(
  cacheService: Pick<CacheService, 'invalidateByTags'> | undefined,
  patch: Partial<Record<(typeof PUBLIC_VISIBILITY_FIELDS)[number], unknown>>,
): Promise<unknown> {
  const isVisibilityChange = PUBLIC_VISIBILITY_FIELDS.some(
    (field) => patch[field] !== undefined,
  );
  return isVisibilityChange && cacheService
    ? cacheService.invalidateByTags([CACHE_TAGS.PUBLIC_BRAND_CONTENT])
    : Promise.resolve();
}
