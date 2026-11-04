import { useAnalyticsContext } from '@contexts/analytics/analytics-context';
import type { IAccountAnalyticsDetail } from '@genfeedai/contracts/interfaces';
import { getDateRangeWithDefaults } from '@helpers/utils/date-range.util';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import {
  isCollectionFetchReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { AnalyticsService } from '@services/analytics/analytics.service';
import { logger } from '@services/core/logger.service';
import type { UseQueryResult } from '@tanstack/react-query';

/**
 * One account's analytics detail over the page's date range. The account page
 * and the accounts list sidebar read through this hook, so opening a row and
 * then its page shares one cached response.
 */
export function useAccountAnalyticsDetail(
  credentialId: string,
): UseQueryResult<IAccountAnalyticsDetail, Error> {
  const scope = useCollectionScope();
  const { brandId, organizationId } = scope;
  const isFetchReady = isCollectionFetchReady(scope);
  const { dateRange, refreshTrigger } = useAnalyticsContext();
  const { startDate, endDate } = getDateRangeWithDefaults(
    dateRange.startDate ?? undefined,
    dateRange.endDate ?? undefined,
  );

  return useAuthedQuery({
    enabled: isFetchReady && Boolean(organizationId && credentialId),
    queryFn: async (service) => {
      try {
        return (await service.getAccountAnalyticsDetail(credentialId, {
          brandId: brandId || undefined,
          endDate,
          organizationId,
          startDate,
        })) as IAccountAnalyticsDetail;
      } catch (requestError) {
        logger.error('Failed to fetch account analytics detail', requestError);
        throw requestError;
      }
    },
    queryKey: [
      'analytics',
      'account-detail',
      organizationId,
      brandId ?? null,
      credentialId,
      startDate,
      endDate,
    ],
    refreshKey: refreshTrigger,
    service: (token: string) => AnalyticsService.getInstance(token),
  });
}
