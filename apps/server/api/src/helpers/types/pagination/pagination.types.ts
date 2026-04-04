export interface PaginationOptions {
  customLabels?: unknown;
  page?: number;
  limit?: number;
  pagination?: boolean;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  pagination?: boolean;
  sort?: string;
  isDeleted?: boolean;
}

export interface AggregateResult<T> {
  docs: T[];
  totalDocs: number;
  limit: number;
  page: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  nextPage?: number;
  prevPage?: number;
}
