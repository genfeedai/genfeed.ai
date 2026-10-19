import type { IUnitEconomicsReport } from '@genfeedai/contracts/interfaces';
import type { UnitEconomicsTableRow } from '@props/admin/unit-economics.props';

export const UNIT_ECONOMICS_TOTAL_ROW_ID = '__total__';

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
