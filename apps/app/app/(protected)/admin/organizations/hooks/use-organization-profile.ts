import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  AnalyticsService,
  type IOrgWithStats,
} from '@services/analytics/analytics.service';
import { useQuery } from '@tanstack/react-query';

/**
 * One organization's identity and headline counts: name, logo, type, owner,
 * slug, created date, members and brands. It is the admin list's own row,
 * narrowed to the organization on screen, so the list and the detail page can
 * never disagree about a count.
 */
export function useOrganizationProfile(organizationId: string | null) {
  const getAnalyticsService = useAuthedService((token: string) =>
    AnalyticsService.getInstance(token),
  );

  return useQuery<IOrgWithStats | null>({
    enabled: Boolean(organizationId),
    queryFn: async ({ signal }) => {
      if (!organizationId) {
        return null;
      }
      const service = await getAnalyticsService();
      const response = await service.getOrganizationsWithStats(
        { limit: 1, organizationId, page: 1 },
        signal,
      );
      return response.data[0] ?? null;
    },
    queryKey: ['organization-profile', organizationId],
  });
}
