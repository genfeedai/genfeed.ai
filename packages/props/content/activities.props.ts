import type { PageScope } from '@ui-constants/misc.constant';

export interface ActivitiesListProps {
  scope: PageScope.SUPERADMIN | PageScope.ORGANIZATION | PageScope.BRAND;
  isStatsEnabled: boolean;
  isFiltersEnabled: boolean;
}
