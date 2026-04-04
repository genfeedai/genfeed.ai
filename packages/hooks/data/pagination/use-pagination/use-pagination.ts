import { useCallback, useState } from 'react';

export interface PaginationOptions {
  initialPage?: number;
  pageSize?: number;
}

export interface PaginationReturn {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  hasMore: boolean;
  hasPrevious: boolean;
  goToPage: (page: number) => void;
  nextPage: () => void;
  previousPage: () => void;
  setTotalPages: (total: number) => void;
  reset: () => void;
}

/**
 * Unified pagination hook
 * Replaces 3 different pagination implementations (PagesService singleton, manual state, etc.)
 *
 * Features:
 * - Page navigation (next, previous, goto)
 * - Total pages tracking
 * - Boundary checks (hasMore, hasPrevious)
 * - Reset functionality
 *
 * @example
 * ```typescript
 * const pagination = usePagination({ pageSize: 24 });
 *
 * const { data } = useResource(
 *   async () => {
 *     const service = await getArticlesService();
 *     const result = await service.findAll({
 *       page: pagination.currentPage,
 *       limit: pagination.pageSize,
 *     });
 *
 *     // Update total pages from API response
 *     if (result.pagination) {
 *       pagination.setTotalPages(result.pagination.totalPages);
 *     }
 *
 *     return result.data;
 *   },
 *   { dependencies: [pagination.currentPage] }
 * );
 *
 * // Use in JSX
 * <Pagination
 *   currentPage={pagination.currentPage}
 *   totalPages={pagination.totalPages}
 *   onPageChange={pagination.goToPage}
 * />
 * ```
 */
export function usePagination(
  options: PaginationOptions = {},
): PaginationReturn {
  const { initialPage = 1, pageSize = 24 } = options;

  const [currentPage, setCurrentPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(1);

  const hasMore = currentPage < totalPages;
  const hasPrevious = currentPage > 1;

  const goToPage = useCallback(
    (page: number) => {
      const validPage = Math.max(1, Math.min(page, totalPages || 1));
      setCurrentPage(validPage);
    },
    [totalPages],
  );

  const nextPage = useCallback(() => {
    if (hasMore) {
      setCurrentPage((prev) => prev + 1);
    }
  }, [hasMore]);

  const previousPage = useCallback(() => {
    if (hasPrevious) {
      setCurrentPage((prev) => Math.max(1, prev - 1));
    }
  }, [hasPrevious]);

  const reset = useCallback(() => {
    setCurrentPage(initialPage);
    setTotalPages(1);
  }, [initialPage]);

  return {
    currentPage,
    goToPage,
    hasMore,
    hasPrevious,
    nextPage,
    pageSize,
    previousPage,
    reset,
    setTotalPages,
    totalPages,
  };
}
