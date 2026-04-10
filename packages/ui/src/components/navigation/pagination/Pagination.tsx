import type { PaginationProps } from '@genfeedai/props/ui/navigation/pagination.props';
import {
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  Pagination as PaginationPrimitive,
} from '@ui/primitives/pagination';

export default function Pagination({
  currentPage = 1,
  totalPages = 1,
  onPageChange,
}: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const clampedPage = Math.min(Math.max(currentPage, 1), totalPages);
  const createPageHref = (page: number) => `?page=${page}`;

  const getVisiblePages = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    if (clampedPage <= 4) {
      return [1, 2, 3, 4, 5, 'ellipsis-end', totalPages] as const;
    }

    if (clampedPage >= totalPages - 3) {
      return [
        1,
        'ellipsis-start',
        totalPages - 4,
        totalPages - 3,
        totalPages - 2,
        totalPages - 1,
        totalPages,
      ] as const;
    }

    return [
      1,
      'ellipsis-start',
      clampedPage - 1,
      clampedPage,
      clampedPage + 1,
      'ellipsis-end',
      totalPages,
    ] as const;
  };

  const visiblePages = getVisiblePages();

  const handlePageChange = (page: number) => {
    if (!onPageChange || page === clampedPage) {
      return;
    }
    onPageChange(page);
  };

  return (
    <PaginationPrimitive className="inline-flex w-auto mx-0 justify-start">
      <PaginationContent>
        <PaginationItem>
          {onPageChange ? (
            <PaginationPrevious
              href="#"
              onClick={(event) => {
                event.preventDefault();
                handlePageChange(clampedPage - 1);
              }}
              aria-disabled={clampedPage === 1}
              className={
                clampedPage === 1 ? 'pointer-events-none opacity-50' : ''
              }
            />
          ) : (
            <PaginationPrevious
              href={createPageHref(Math.max(clampedPage - 1, 1))}
              aria-disabled={clampedPage === 1}
              className={
                clampedPage === 1 ? 'pointer-events-none opacity-50' : ''
              }
            />
          )}
        </PaginationItem>

        {visiblePages.map((item) => {
          if (typeof item === 'string') {
            return (
              <PaginationItem key={item}>
                <PaginationEllipsis />
              </PaginationItem>
            );
          }

          if (onPageChange) {
            return (
              <PaginationItem key={item}>
                <PaginationLink
                  href="#"
                  isActive={item === clampedPage}
                  onClick={(event) => {
                    event.preventDefault();
                    handlePageChange(item);
                  }}
                >
                  {item}
                </PaginationLink>
              </PaginationItem>
            );
          }

          return (
            <PaginationItem key={item}>
              <PaginationLink
                href={createPageHref(item)}
                isActive={item === clampedPage}
                onClick={(event) => {
                  if (item === clampedPage) {
                    event.preventDefault();
                  }
                }}
              >
                {item}
              </PaginationLink>
            </PaginationItem>
          );
        })}

        <PaginationItem>
          {onPageChange ? (
            <PaginationNext
              href="#"
              onClick={(event) => {
                event.preventDefault();
                handlePageChange(clampedPage + 1);
              }}
              aria-disabled={clampedPage === totalPages}
              className={
                clampedPage === totalPages
                  ? 'pointer-events-none opacity-50'
                  : ''
              }
            />
          ) : (
            <PaginationNext
              href={createPageHref(Math.min(clampedPage + 1, totalPages))}
              aria-disabled={clampedPage === totalPages}
              className={
                clampedPage === totalPages
                  ? 'pointer-events-none opacity-50'
                  : ''
              }
            />
          )}
        </PaginationItem>
      </PaginationContent>
    </PaginationPrimitive>
  );
}
