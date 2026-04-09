import type { PageScope } from '@genfeedai/enums';

export interface ActivitiesListProps {
  scope: PageScope.SUPERADMIN | PageScope.ORGANIZATION | PageScope.BRAND;
  isStatsEnabled: boolean;
  isFiltersEnabled: boolean;
}
