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
