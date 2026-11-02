'use client';

import type { SummaryRowSidebarConfig } from '@genfeedai/props/ui/display/summary-row-sidebar.props';
import type { TableRowSidebar } from '@genfeedai/props/ui/display/table.props';
import TableRowSummary from '@ui/display/table/TableRowSummary';

/**
 * Builds the `rowSidebar` of a table whose rows open a summary of the record
 * in the right context sidebar. Facts that carry an `editor` are edited in
 * place there; no Edit button, no form modal.
 */
export function createSummaryRowSidebar<T>({
  getBadges,
  getFacts,
  getId,
  getOpenHref,
  getSubtitle,
  getTitle,
  kind,
  openLabel,
  renderExtra,
}: SummaryRowSidebarConfig<T>): TableRowSidebar<T> {
  return {
    getId,
    getSubtitle,
    getTitle,
    kind,
    render: (item) => {
      const extra = renderExtra?.(item);

      return (
        <TableRowSummary
          badges={getBadges?.(item)}
          facts={getFacts?.(item)}
          openHref={getOpenHref?.(item)}
          openLabel={openLabel}
        >
          {extra}
        </TableRowSummary>
      );
    },
  };
}
