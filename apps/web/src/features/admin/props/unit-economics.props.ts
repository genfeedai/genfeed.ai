import type { UnitEconomicsSortKey } from '@genfeedai/contracts/constants';
import type {
  IUnitEconomicsReport,
  IUnitEconomicsRow,
} from '@genfeedai/contracts/interfaces';
import type { TableSortDirection } from '@props/ui/display/table.props';

/** A report row, or the synthetic totals row pinned under the sorted rows. */
export interface UnitEconomicsTableRow extends IUnitEconomicsRow {
  isTotal: boolean;
}

export interface UseUnitEconomicsReportOptions {
  /** Skips the request while the report is not on screen. */
  isEnabled?: boolean;
  /** Drill into this organization's users; omit for the per-organization report. */
  organizationId?: string;
  /** Length of the reporting window, in days. */
  periodDays: string;
}

export interface OrganizationSpendingPanelProps {
  error: unknown;
  isLoading: boolean;
  onSortChange: (key: string, direction: TableSortDirection) => void;
  /** The organization's report: its users as rows, the organization as totals. */
  report: IUnitEconomicsReport | undefined;
  sortDirection: TableSortDirection;
  sortKey: UnitEconomicsSortKey;
}
