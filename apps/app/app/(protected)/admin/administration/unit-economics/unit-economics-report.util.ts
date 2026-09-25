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

export const UNIT_ECONOMICS_PERIOD_OPTIONS = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
  { days: 365, label: 'Last 365 days' },
] as const;

const USD_FORMATTER = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: 'currency',
});

const SMALL_USD_FORMATTER = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  maximumFractionDigits: 4,
  minimumFractionDigits: 2,
  style: 'currency',
});

/** Provider costs are often fractions of a cent; keep them readable. */
export function formatUsd(value: number): string {
  return Math.abs(value) > 0 && Math.abs(value) < 1
    ? SMALL_USD_FORMATTER.format(value)
    : USD_FORMATTER.format(value);
}

export function formatMarginPercent(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}%`;
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Inclusive UTC day range ending today. */
export function buildUnitEconomicsRange(
  days: number,
  now: Date = new Date(),
): { from: string; to: string } {
  const from = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  return { from: toDateOnly(from), to: toDateOnly(now) };
}

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
      label: 'Total',
      topModels: [],
    },
  ];
}
