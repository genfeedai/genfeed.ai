/**
 * Paginated list response shape returned by BaseService.findAll and the
 * collection list endpoints (docs/totalDocs field names are part of the
 * public API contract).
 */

export interface AggregatePaginateResult<T> {
  docs: T[];
  totalDocs: number;
  limit: number;
  page?: number | undefined;
  totalPages: number;
  nextPage?: number | null | undefined;
  prevPage?: number | null | undefined;
  pagingCounter: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
  meta?: Record<string, unknown> | null;
  [customLabel: string]:
    | Record<string, unknown>
    | T[]
    | number
    | boolean
    | null
    | undefined;
}
