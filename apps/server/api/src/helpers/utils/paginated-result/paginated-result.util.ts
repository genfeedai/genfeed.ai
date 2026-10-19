import type { BackendPagination } from '@api/shared/utils/pagination-transform/pagination-transform.util';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';

/**
 * A page envelope that is both the BaseService list shape and the fully
 * populated `BackendPagination` that `transformPaginationFormat` consumes.
 */
export type PaginatedResult<T> = AggregatePaginateResult<T> &
  BackendPagination<T>;

/**
 * Builds the BaseService-style page envelope for a service that runs its own
 * Prisma `findMany` + `count` (skip/take) instead of going through
 * `BaseService.findAll`. `serializeCollection` reads `totalDocs`/`page` off it
 * to emit the JSON:API `pagination` links.
 */
export function buildPaginatedResult<T>(
  docs: T[],
  totalDocs: number,
  page: number,
  limit: number,
): PaginatedResult<T> {
  const totalPages = Math.ceil(totalDocs / limit);
  return {
    docs,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
    limit,
    nextPage: page < totalPages ? page + 1 : null,
    page,
    pagingCounter: (page - 1) * limit + 1,
    prevPage: page > 1 ? page - 1 : null,
    totalDocs,
    totalPages,
  };
}
