'use client';

import type { AutoPaginationProps } from '@genfeedai/props/ui/navigation/pagination.props';
import { PagesService } from '@genfeedai/services/content/pages.service';
import Pagination from '@ui/navigation/pagination/Pagination';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

/**
 * Automatic pagination component that reads from URL and PagesService
 *
 * Replaces the repetitive pattern of:
 * ```tsx
 * <Pagination
 *   currentPage={PagesService.getCurrentPage()}
 *   totalPages={PagesService.getTotalPages()}
 * />
 * ```
 *
 * With just:
 * ```tsx
 * <AutoPagination showTotal />
 * ```
 *
 * Features:
 * - Automatically reads `page` from URL search params
 * - Automatically reads `totalPages` from PagesService (set by BaseService.findAll)
 * - Optionally displays total count
 * - Uses URL-based navigation (works with browser back/forward)
 * - Preserves all existing query parameters when changing pages
 *
 * @example
 * ```tsx
 * // Basic usage
 * <AutoPagination />
 *
 * // With total count display
 * <AutoPagination showTotal />
 *
 * // With custom label
 * <AutoPagination showTotal totalLabel="posts" />
 * ```
 */
export default function AutoPagination({
  showTotal = false,
  totalLabel = 'results',
}: AutoPaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Read from URL (defaults to page 1)
  const currentPage = Number(searchParams?.get('page')) || 1;

  // Read from PagesService (set by BaseService.findAll)
  const totalPages = PagesService.getTotalPages();
  const totalDocs = PagesService.getTotalDocs();

  // Handle page change while preserving all query parameters
  const handlePageChange = useCallback(
    (page: number) => {
      const params = new URLSearchParams(searchParams?.toString() || '');

      if (page === 1) {
        // Remove page param if going to page 1
        params.delete('page');
      } else {
        // Set page param
        params.set('page', page.toString());
      }

      const queryString = params.toString();
      const newUrl = queryString ? `${pathname}?${queryString}` : pathname;

      router.replace(newUrl, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // Don't render if there's only 1 page
  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="flex flex-row justify-between items-center gap-4">
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={handlePageChange}
      />

      {showTotal && totalDocs > 0 && (
        <div className="text-sm text-foreground/60">
          Showing page {currentPage} of {totalPages} ({totalDocs} {totalLabel})
        </div>
      )}
    </div>
  );
}
