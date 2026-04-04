import { ITEMS_PER_PAGE } from '@genfeedai/constants';

export interface BackendPagination<T = unknown> {
  docs: T[];
  totalDocs: number;
  limit: number;
  page: number;
  totalPages: number;
  nextPage: number | null;
  prevPage: number | null;
  hasPrevPage: boolean;
  hasNextPage: boolean;
  pagingCounter: number;
}

export interface FrontendPagination<T = unknown> {
  data: T[];
  links: {
    pagination: {
      total: number;
      limit: number;
      page: number;
      pages: number;
      next: number | null;
      prev: number | null;
      hasPrev: boolean;
      hasNext: boolean;
    };
  };
}

/**
 * Transforms backend pagination format to frontend format
 * Aligns with frontend's `links.pagination` structure
 */
export function transformPaginationFormat<T>(
  backendPagination: BackendPagination<T>,
): FrontendPagination<T> {
  return {
    data: backendPagination.docs,
    links: {
      pagination: {
        hasNext: backendPagination.hasNextPage,
        hasPrev: backendPagination.hasPrevPage,
        limit: backendPagination.limit,
        next: backendPagination.nextPage,
        page: backendPagination.page,
        pages: backendPagination.totalPages,
        prev: backendPagination.prevPage,
        total: backendPagination.totalDocs,
      },
    },
  };
}

/**
 * Creates default pagination options
 */
export function getDefaultPaginationOptions(
  page: number = 1,
  limit: number = ITEMS_PER_PAGE,
  customLabels?: Record<string, string>,
) {
  return {
    customLabels: customLabels || {
      docs: 'data',
      hasNextPage: 'hasNext',
      hasPrevPage: 'hasPrev',
      limit: 'limit',
      nextPage: 'next',
      page: 'page',
      prevPage: 'prev',
      totalDocs: 'total',
      totalPages: 'pages',
    },
    limit,
    page,
    pagination: true,
  };
}
