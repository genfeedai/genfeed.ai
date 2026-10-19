import { useEffect, useMemo, useState } from 'react';

interface ClientPagination<T> {
  currentPage: number;
  pageItems: T[];
  setPage: (page: number) => void;
  totalPages: number;
}

/**
 * Pages an in-memory list. The page snaps back into range when the list
 * shrinks, e.g. after a filter or a refresh.
 */
export function useClientPagination<T>(
  items: readonly T[],
  pageSize: number,
): ClientPagination<T> {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const pageItems = useMemo(
    () => items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, items, pageSize],
  );

  return { currentPage, pageItems, setPage, totalPages };
}
