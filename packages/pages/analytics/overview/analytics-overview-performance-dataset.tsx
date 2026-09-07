'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type {
  IPerformanceContentItem,
  IWeeklyPerformanceSummary,
  PerformanceDatasetConfidence,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  isCollectionFetchReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { ContentPerformanceService } from '@services/analytics/content-performance.service';
import { logger } from '@services/core/logger.service';
import Badge from '@ui/display/badge/Badge';
import { ListRow } from '@ui/lists/list-row/ListRow';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

const CONFIDENCE_BADGE_VARIANT: Record<
  PerformanceDatasetConfidence,
  'warning' | 'info' | 'success'
> = {
  high: 'success',
  low: 'warning',
  medium: 'info',
  none: 'warning',
};

const LOW_CONFIDENCE_STATES: PerformanceDatasetConfidence[] = ['none', 'low'];

export default function AnalyticsOverviewPerformanceDataset() {
  const translate = useTranslations('pages.analytics.performanceDataset');
  const scope = useCollectionScope();
  const { brandId } = scope;
  const { href } = useOrgUrl();
  const isFetchReady = isCollectionFetchReady(scope) && Boolean(brandId);
  const getService = useAuthedService((token: string) =>
    ContentPerformanceService.getInstance(token),
  );
  const [summary, setSummary] = useState<IWeeklyPerformanceSummary | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isFetchReady || !brandId) {
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    void (async () => {
      try {
        const service = await getService();
        const data = await service.getWeeklySummary({ brandId });
        if (!controller.signal.aborted) {
          setSummary(data);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          logger.error('Failed to fetch weekly performance summary', error);
          setSummary(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    })();
    return () => controller.abort();
  }, [brandId, getService, isFetchReady]);

  if (!isFetchReady || isLoading || !summary) {
    return null;
  }

  const { dataset, topPerformers } = summary;
  const isLowConfidence = LOW_CONFIDENCE_STATES.includes(dataset.confidence);

  return (
    <WorkspaceSurface
      density="compact"
      flush
      title={translate('title')}
      actions={
        <Badge variant={CONFIDENCE_BADGE_VARIANT[dataset.confidence]}>
          {translate(`confidence.${dataset.confidence}`)}
        </Badge>
      }
    >
      <div className="flex flex-col gap-3 px-4 pt-3 sm:px-5">
        <p className="text-sm text-foreground/70">
          {translate('summaryLine', {
            imported: dataset.importedPosts,
            total: dataset.totalPosts,
          })}
        </p>

        {isLowConfidence ? (
          <p className="text-sm text-foreground/55">
            {translate('coldStartHint')}{' '}
            <Link
              href={href(APP_ROUTES.SETTINGS.SOCIAL)}
              className="font-medium text-foreground underline underline-offset-2"
            >
              {translate('coldStartHintLink')}
            </Link>
          </p>
        ) : null}
      </div>

      {topPerformers.length > 0 ? (
        <div>
          {topPerformers.map((item: IPerformanceContentItem) =>
            item.origin === 'imported' ? (
              <ListRow
                key={`${item.origin}-${item.sourcePostId ?? item.postId}`}
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
                key={`${item.origin}-${item.postId}`}
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
