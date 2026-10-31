import type { IOrgWithStats } from '@services/analytics/analytics.service';

export interface OrganizationProfileHeaderProps {
  isLoading: boolean;
  profile: IOrgWithStats | null | undefined;
}
