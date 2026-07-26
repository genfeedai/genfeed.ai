/**
 * Paginated list response shape consumed internally by
 * `BaseCRUDController.findAll`. Kept local (rather than the broader
 * `apps/server/api/src/types/aggregate-paginate-result.ts` contract) because
 * the base controller only reads a subset of fields and tolerates an
 * `unknown`-valued index signature for whatever a given service attaches.
 */
export type AggregatePaginateResult<T> = {
  docs: T[];
  totalDocs: number;
  limit: number;
  page?: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  [key: string]: unknown;
};
