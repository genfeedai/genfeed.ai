import type { IPaginatedResponse } from '@genfeedai/contracts/interfaces';
import type { JsonApiResponseDocument } from '@services/core/json-api';

/** Keeps the rows and pagination from one JSON:API response together. */
export function toPaginatedResponse<T>(
  items: T[],
  document: JsonApiResponseDocument,
): IPaginatedResponse<T> {
  const cursor = document.links?.cursor;
  if (cursor) {
    return {
      hasNext: cursor.hasMore,
      hasPrevious: false,
      items,
      nextCursor: cursor.nextCursor,
      page: 1,
      pageSize: cursor.limit,
      total: items.length,
      totalPages: 1,
    };
  }
  const pagination = document.links?.pagination;
  const page = pagination?.page ?? 1;
  const totalPages = Math.max(1, pagination?.pages ?? 1);
  return {
    hasNext: page < totalPages,
    hasPrevious: page > 1,
    items,
    page,
    pageSize: pagination?.limit ?? items.length,
    total: pagination?.total ?? items.length,
    totalPages,
  };
}
