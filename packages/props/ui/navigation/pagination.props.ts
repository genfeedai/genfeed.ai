import type { IPageTotals } from '@genfeedai/contracts/interfaces';
import type { ReactNode } from 'react';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems?: number;
  totalLabel?: string;
  onPageChange?: (page: number) => void;
}

export interface AutoPaginationProps {
  /**
   * Show total results count
   * @default true
   */
  showTotal?: boolean;

  /**
   * Label for the total count display
   * @default "results"
   */
  totalLabel?: string;

  /**
   * The totals cached with the rows on screen (`usePagedAuthedQuery`). Without
   * them the footer reads the totals of the last list request, which on a
   * cached page can be another list's.
   */
  totals?: IPageTotals;
}

export interface PaginationStepperProps {
  className?: string;
  hasNext: boolean;
  hasPrevious: boolean;
  /** Disables both buttons, e.g. while a page is loading. */
  isDisabled?: boolean;
  nextLabel: string;
  onNext: () => void;
  onPrevious: () => void;
  previousLabel: string;
  /** Position text between the buttons, e.g. "Page 2 of 5". */
  status: ReactNode;
}
