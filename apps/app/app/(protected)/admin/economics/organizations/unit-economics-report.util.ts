import type {
  IUnitEconomicsReport,
  IUnitEconomicsRow,
} from '@genfeedai/contracts/interfaces';
import type {
  UnitEconomicsSortKey,
  UnitEconomicsTableRow,
} from '@props/admin/unit-economics.props';
import type { TableSortDirection } from '@props/ui/display/table.props';

export const UNIT_ECONOMICS_TOTAL_ROW_ID = '__total__';

function compareRows(
  left: IUnitEconomicsRow,
  right: IUnitEconomicsRow,
  key: UnitEconomicsSortKey,
): number {
  if (key === 'label') {
    return left.label.localeCompare(right.label);
  }
  // A row without revenue has no margin %; it sorts below every real value.
  const leftValue = left[key] ?? Number.NEGATIVE_INFINITY;
  const rightValue = right[key] ?? Number.NEGATIVE_INFINITY;
  return leftValue - rightValue;
}

/** Sorted rows with the totals row always last, whatever the sort. */
export function buildUnitEconomicsTableRows(
  report: IUnitEconomicsReport | undefined,
  sortKey: UnitEconomicsSortKey,
  sortDirection: TableSortDirection,
  totalLabel: string,
): UnitEconomicsTableRow[] {
  if (!report) {
    return [];
  }
  const direction = sortDirection === 'asc' ? 1 : -1;
  const rows = [...report.rows]
    .sort(
      (left, right) =>
        direction * compareRows(left, right, sortKey) ||
        left.label.localeCompare(right.label),
    )
    .map((row) => ({ ...row, isTotal: false }));

  if (rows.length === 0) {
    return rows;
  }

  return [
    ...rows,
    {
      ...report.totals,
      id: UNIT_ECONOMICS_TOTAL_ROW_ID,
      isTotal: true,
      label: totalLabel,
      topModels: [],
    },
  ];
}
