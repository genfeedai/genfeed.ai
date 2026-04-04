export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange?: (page: number) => void;
}

export interface AutoPaginationProps {
  /**
   * Show total results count (e.g., "Showing 1-10 of 156")
   * @default false
   */
  showTotal?: boolean;

  /**
   * Label for the total count display
   * @default "results"
   */
  totalLabel?: string;
}
