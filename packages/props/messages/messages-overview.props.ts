import type { PageScope } from '@genfeedai/contracts';

export interface MessagesOverviewProps {
  /** Organization scope counts every brand's conversations. */
  scope?: PageScope.BRAND | PageScope.ORGANIZATION;
}
