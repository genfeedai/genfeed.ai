'use client';

import { useAnalyticsContext } from '@contexts/analytics/analytics-context';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { IPerformanceContentItem } from '@genfeedai/contracts/interfaces';
import { getDateRangeWithDefaults } from '@helpers/utils/date-range.util';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import {
  isCollectionFetchReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { ContentPerformanceService } from '@services/analytics/content-performance.service';
import { logger } from '@services/core/logger.service';
import { ListRow } from '@ui/lists/list-row/ListRow';
import { Badge } from '@ui/primitives/badge';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import PerformanceDatasetBadge, {
  LOW_CONFIDENCE_STATES,
} from '@/components/analytics/performance-dataset-badge/PerformanceDatasetBadge';
import { WorkspaceSurface } from '@/components/overview/WorkspaceSurface';

export default function AnalyticsOverviewPerformanceDataset() {
  const translate = useTranslations('pages.analytics.performanceDataset');
  const scope = useCollectionScope();
  const { brandId } = scope;
  const { brandSlug, href, orgHref } = useOrgUrl();
  const { dateRange, refreshTrigger } = useAnalyticsContext();
  const { startDate, endDate } = getDateRangeWithDefaults(
    dateRange.startDate ?? undefined,
    dateRange.endDate ?? undefined,
  );
  const isFetchReady = isCollectionFetchReady(scope) && Boolean(brandId);
  // Cached per brand and range: coming back to the overview paints the
  // dataset line at once while it refreshes.
  const { data: summary = null, isPending: isLoading } = useAuthedQuery({
    enabled: isFetchReady && Boolean(brandId),
    queryFn: async (service) => {
      try {
        return (
          (await service.getWeeklySummary({
            brandId: brandId ?? '',
            endDate,
            startDate,
          })) ?? null
        );
      } catch (error) {
        logger.error('Failed to fetch weekly performance summary', error);
        throw error;
      }
    },
    queryKey: ['weekly-performance-summary', brandId, startDate, endDate],
    refreshKey: refreshTrigger,
    service: (token: string) => ContentPerformanceService.getInstance(token),
  });

  // A malformed or partial response (e.g. an unhandled API error falling
  // through to a generic empty-collection shape) can resolve successfully
  // without a `dataset` -- render nothing rather than crash. See #5381.
  if (!isFetchReady || isLoading || !summary || !summary.dataset) {
    return null;
  }

  const { dataset, topPerformers } = summary;
  const isLowConfidence = LOW_CONFIDENCE_STATES.includes(dataset.confidence);

  return (
    <WorkspaceSurface
      density="compact"
      flush
      title={translate('title')}
      actions={<PerformanceDatasetBadge confidence={dataset.confidence} />}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 sm:px-5">
        <p className="text-sm text-foreground/70">
          {translate('summaryLine', {
            imported: dataset.importedPosts,
            total: dataset.totalPosts,
          })}
        </p>

        {isLowConfidence ? (
          <Link
            href={
              brandSlug
                ? href(APP_ROUTES.SETTINGS.CONNECTED_ACCOUNTS)
                : orgHref(APP_ROUTES.SETTINGS.BRANDS)
            }
            className="text-sm font-medium text-foreground underline underline-offset-2"
          >
            {translate('coldStartHintLink')}
          </Link>
        ) : null}
      </div>

      {topPerformers.length > 0 ? (
        <div className="border-t border-border">
          {topPerformers.map((item: IPerformanceContentItem) =>
            item.origin === 'imported' ? (
              <ListRow
                key={item.id}
                density="compact"
                title={item.title || item.description}
                trailing={
                  <Badge variant="secondary">
                    {translate('importedBadge')}
                  </Badge>
                }
              />
            ) : (
              <ListRow
                key={item.id}
                density="compact"
                href={href(`${APP_ROUTES.PUBLISHING.POSTS}/${item.postId}`)}
                title={item.title || item.description}
              />
            ),
          )}
        </div>
      ) : null}
    </WorkspaceSurface>
  );
}
