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
}
