import type { ActivityMessageFormatter, PageScope } from '@genfeedai/enums';

export interface ActivitiesListProps {
  activityMessageFormatter?: ActivityMessageFormatter;
  scope: PageScope.SUPERADMIN | PageScope.ORGANIZATION | PageScope.BRAND;
  isStatsEnabled: boolean;
  isFiltersEnabled: boolean;
}
