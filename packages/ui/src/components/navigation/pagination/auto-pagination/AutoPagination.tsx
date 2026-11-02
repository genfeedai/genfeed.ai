'use client';

import type { AutoPaginationProps } from '@genfeedai/props/ui/navigation/pagination.props';
import Pagination from '@ui/navigation/pagination/Pagination';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback } from 'react';

/** URL-driven page navigation using the displayed list's own response totals. */
function AutoPaginationContent({
  showTotal = true,
  totalLabel = 'results',
  totals,
}: AutoPaginationProps) {
  const { replace } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();

  // Read from URL (defaults to page 1)
  const currentPage = Number(searchParams.get('page')) || 1;

  const { totalDocs, totalPages } = totals;

  // Handle page change while preserving all query parameters
  const handlePageChange = useCallback(
    (page: number) => {
      const params = new URLSearchParams(searchParamsString);

      if (page === 1) {
        // Remove page param if going to page 1
        params.delete('page');
      } else {
        params.set('page', page.toString());
      }

      const queryString = params.toString();
      const newUrl = queryString ? `${pathname}?${queryString}` : pathname;

      replace(newUrl, { scroll: false });
    },
    [pathname, replace, searchParamsString],
  );

  return (
    <Pagination
      currentPage={currentPage}
      totalPages={totalPages}
      totalItems={showTotal ? totalDocs : undefined}
      totalLabel={totalLabel}
      onPageChange={handlePageChange}
    />
  );
}

export default function AutoPagination(props: AutoPaginationProps) {
  return (
    <Suspense fallback={null}>
      <AutoPaginationContent {...props} />
    </Suspense>
  );
}
