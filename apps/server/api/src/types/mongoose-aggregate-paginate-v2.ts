/**
 * Type definitions for mongoose-aggregate-paginate-v2
 * Canonical source for pagination types used across the API.
 * Converted from .d.ts to .ts for Bun runtime compatibility.
 *
 * NOTE: `any` types are kept intentionally to match the upstream library's
 * type signatures (mongoose-aggregate-paginate-v2).
 */

import type { Model, PipelineStage } from 'mongoose';

export type PrePaginatePipelineStage = PipelineStage | '__PREPAGINATE__';

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

export interface AggregatePaginateModel<T> extends Model<T> {
  aggregatePaginate<R>(
    query?: unknown,
    options?: PaginateOptions,
    callback?: (err: unknown, result: AggregatePaginateResult<R>) => void,
  ): Promise<AggregatePaginateResult<R>>;
}
