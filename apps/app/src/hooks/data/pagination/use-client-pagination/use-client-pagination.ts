import { useCallback, useMemo, useState } from 'react';

export interface UseClientPaginationOptions {
  pageSize?: number;
  /**
   * Back to page 1 whenever this changes (search text, filters, sort). Derived
   * during render, so a filtered-down list never flashes an empty page.
   */
  resetKey?: string;
}

export interface UseClientPaginationReturn<Item> {
  currentPage: number;
  goToPage: (page: number) => void;
  pageItems: Item[];
  pageSize: number;
  /** 1-based position of the first item on the current page. */
  startRank: number;
  totalItems: number;
  totalPages: number;
}

/**
 * Pagination over a list that is already in memory (a capped top-N response).
 * Server-paginated lists use `Pagination` / `AutoPagination` directly instead.
 */
export function useClientPagination<Item>(
  items: readonly Item[],
  options: UseClientPaginationOptions = {},
): UseClientPaginationReturn<Item> {
  const { pageSize = 12, resetKey = '' } = options;
  const [state, setState] = useState({ key: resetKey, page: 1 });

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const requestedPage = state.key === resetKey ? state.page : 1;
  const currentPage = Math.min(Math.max(requestedPage, 1), totalPages);

  const pageItems = useMemo(
    () => items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, items, pageSize],
  );

  const goToPage = useCallback(
    (page: number) => {
      setState({
        key: resetKey,
        page: Math.min(Math.max(page, 1), totalPages),
      });
    },
    [resetKey, totalPages],
  );

  return {
    currentPage,
    goToPage,
    pageItems,
    pageSize,
    startRank: (currentPage - 1) * pageSize + 1,
    totalItems: items.length,
    totalPages,
  };
}
