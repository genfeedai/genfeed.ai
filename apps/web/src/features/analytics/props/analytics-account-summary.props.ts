import type { IAccountAnalytics } from '@genfeedai/contracts/interfaces';
import type { SummaryFact } from '@genfeedai/props/ui/display/table-row-summary.props';

export interface AnalyticsAccountSummaryProps {
  account: IAccountAnalytics;
  /** The row's own columns, repeated as the sidebar's definition list. */
  facts: SummaryFact[];
  /** The account's analytics page. */
  openHref: string;
}
