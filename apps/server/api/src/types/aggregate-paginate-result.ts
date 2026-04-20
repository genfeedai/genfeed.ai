/**
 * Type definitions for aggregate pagination results.
 * Shared by legacy aggregation call sites and Prisma-based result shaping.
 */

export interface CustomLabels<T = string | undefined | boolean> {
  totalDocs?: T | undefined;
  docs?: T | undefined;
  limit?: T | undefined;
  page?: T | undefined;
  nextPage?: T | undefined;
  prevPage?: T | undefined;
  hasNextPage?: T | undefined;
  hasPrevPage?: T | undefined;
  totalPages?: T | undefined;
  pagingCounter?: T | undefined;
  meta?: T | undefined;
}

export interface PaginateOptions {
  sort?: object | string | undefined;
  offset?: number | undefined;
  page?: number | undefined;
  limit?: number | undefined;
  customLabels?: CustomLabels | undefined;
  /* If pagination is set to `false`, it will return all docs without adding limit condition. (Default: `true`) */
  pagination?: boolean | undefined;
  allowDiskUse?: boolean | undefined;
  countQuery?: object | undefined;
  useFacet?: boolean | undefined;
}

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

/** @deprecated Use Prisma-based pagination instead */
export interface AggregatePaginateModel<T> {
  aggregatePaginate<R>(
    query?: unknown,
    options?: PaginateOptions,
    callback?: (err: unknown, result: AggregatePaginateResult<R>) => void,
  ): Promise<AggregatePaginateResult<R>>;
}
