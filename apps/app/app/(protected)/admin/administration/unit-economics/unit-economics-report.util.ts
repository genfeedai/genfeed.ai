import type { IUnitEconomicsReport } from '@genfeedai/contracts/interfaces';
import type { UnitEconomicsTableRow } from '@props/admin/unit-economics.props';

export const UNIT_ECONOMICS_TOTAL_ROW_ID = '__total__';

export const UNIT_ECONOMICS_PERIOD_DAYS = [7, 30, 90, 365] as const;

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

/** The API's already-sorted page, with the report-wide totals row always last. */
export function buildUnitEconomicsTableRows(
  report: IUnitEconomicsReport | undefined,
  totalLabel: string,
): UnitEconomicsTableRow[] {
  if (!report) {
    return [];
  }
  const rows = report.rows.map((row) => ({ ...row, isTotal: false }));

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
