import type {
  IPageTotals,
  IPaginatedResponse,
} from '@genfeedai/contracts/interfaces';

/** A server page fixture: totals travel with the rows, never through globals. */
export function paginatedResponse<T>(
  items: T[],
  totals: IPageTotals = { totalDocs: items.length, totalPages: 1 },
): IPaginatedResponse<T> {
  return {
    items,
    total: totals.totalDocs,
    totalPages: totals.totalPages,
    page: 1,
    pageSize: 15,
    hasNext: totals.totalPages > 1,
    hasPrevious: false,
  };
}
