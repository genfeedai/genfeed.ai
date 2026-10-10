import type { PageScope } from '@genfeedai/contracts';

export interface LibraryOverviewProps {
  /** Organization scope has no brand, so it leaves out brand-only References. */
  scope?: PageScope.BRAND | PageScope.ORGANIZATION;
}
