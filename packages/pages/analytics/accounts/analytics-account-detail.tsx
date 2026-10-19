'use client';

import { useAnalyticsContext } from '@contexts/analytics/analytics-context';
import {
  AnalyticsMetric,
  ButtonVariant,
  PageScope,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type {
  IAccountAnalyticsDetail,
  ITopContent,
} from '@genfeedai/contracts/interfaces';
import { getPublishingPostHref } from '@helpers/content/posts.helper';
import { formatCompactNumberIntl } from '@helpers/formatting/format/format.helper';
import { getDateRangeWithDefaults } from '@helpers/utils/date-range.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  isCollectionFetchReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import PostDetailPanel from '@pages/posts/detail/PostDetailPanel';
import type { TableColumn } from '@props/ui/display/table.props';
import { AnalyticsService } from '@services/analytics/analytics.service';
import { logger } from '@services/core/logger.service';
import { AnalyticsMetricLabel } from '@ui/analytics/metric-definition/AnalyticsMetricInfo';
import Card from '@ui/card/Card';
import Table from '@ui/display/table/Table';
import { ErrorFallback } from '@ui/error/ErrorFallback';
import LoadingState from '@ui/feedback/LoadingState';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

export default function AnalyticsAccountDetail() {
  const translate = useTranslations('pages.analytics.accounts');
  const router = useRouter();
  const { href } = useOrgUrl();
  const params = useParams<{ id: string }>();
  const credentialId = params.id;
  const scope = useCollectionScope();
  const { brandId, organizationId } = scope;
  const isFetchReady = isCollectionFetchReady(scope);
  const { dateRange, refreshTrigger, triggerRefresh } = useAnalyticsContext();
  const getService = useAuthedService((token: string) =>
    AnalyticsService.getInstance(token),
  );
  const [detail, setDetail] = useState<IAccountAnalyticsDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

  useEffect(() => {
    if (!isFetchReady || !organizationId || refreshTrigger < 0) {
      return;
    }

    const controller = new AbortController();
    void (async () => {
      setError(null);
      setIsLoading(true);
      try {
        const service = await getService();
        const { startDate, endDate } = getDateRangeWithDefaults(
          dateRange.startDate ?? undefined,
          dateRange.endDate ?? undefined,
        );
        const data = (await service.getAccountAnalyticsDetail(credentialId, {
          brandId: brandId || undefined,
          endDate,
          organizationId,
          startDate,
        })) as IAccountAnalyticsDetail;
        if (!controller.signal.aborted) {
          setDetail(data);
        }
      } catch (requestError) {
        if (!controller.signal.aborted) {
          logger.error(
            'Failed to fetch account analytics detail',
            requestError,
          );
          setError(translate('loadError'));
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    })();
    return () => controller.abort();
  }, [
    brandId,
    credentialId,
    dateRange.endDate,
    dateRange.startDate,
    getService,
    isFetchReady,
    organizationId,
    translate,
    refreshTrigger,
  ]);

  const title =
    detail?.identity.label || detail?.identity.externalHandle || 'Account';
  const columns: TableColumn<ITopContent>[] = useMemo(
    () => [
      {
        key: 'title',
        header: 'Post',
        render: (row) => (
          <Link
            className="hover:underline"
            href={href(getPublishingPostHref(row.postId))}
          >
            {row.title || row.postId}
          </Link>
        ),
      },
      {
        key: 'views',
        header: (
          <AnalyticsMetricLabel metric="views">Views</AnalyticsMetricLabel>
        ),
        render: (row) => formatCompactNumberIntl(row.views),
      },
      {
        key: 'likes',
        header: (
          <AnalyticsMetricLabel metric="likes">Likes</AnalyticsMetricLabel>
        ),
        render: (row) => formatCompactNumberIntl(row.likes),
      },
    ],
    [href],
  );

  if (error) {
    return (
      <Container label={translate('errorTitle')}>
        <ErrorFallback
          title={translate('errorTitle')}
          description={error}
          resetErrorBoundary={triggerRefresh}
        />
      </Container>
    );
  }

  if (isLoading && !detail) {
    return (
      <Container label={title}>
        <LoadingState />
      </Container>
    );
  }

  return (
    <Container
      label={title}
      right={
        <Button
          label="Manage account"
          variant={ButtonVariant.SECONDARY}
          onClick={() =>
            router.push(
              detail?.identity.manageHref ??
                APP_ROUTES.SETTINGS.CONNECTED_ACCOUNTS,
            )
          }
        />
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
        {(detail?.metrics ?? []).map((metric) => (
          <Card key={metric.metric}>
            <p className="text-sm text-muted-foreground">
              <AnalyticsMetricLabel metric={metric.metric}>
                {metric.metric}
              </AnalyticsMetricLabel>
            </p>
            <p className="text-2xl">
              {metric.availability === 'observed' && metric.change !== null
                ? formatCompactNumberIntl(metric.change)
                : 'Unavailable'}
            </p>
          </Card>
        ))}
      </div>
      {detail?.evaluation ? (
        <Card className="mt-4">
          <p className="text-sm text-muted-foreground">
            {translate('evaluation')}
          </p>
          <p className="text-lg">{detail.evaluation.state}</p>
          <p className="text-sm">
            {translate('postsOverWeeks', {
              posts: detail.evaluation.evidence.publishedPosts,
              weeks: detail.evaluation.evidence.windowWeeks,
            })}
          </p>
        </Card>
      ) : null}
      <Card className="mt-4">
        <p className="mb-2 text-sm text-muted-foreground">
          {translate('trend')}
        </p>
        {detail?.series?.length ? (
          <ul className="space-y-1">
            {detail.series.map((point) => {
              const views = point.metrics.find(
                (metric) => metric.metric === AnalyticsMetric.VIEWS,
              );
              return (
                <li key={point.date} className="flex justify-between">
                  <span>{point.date}</span>
                  <span>
                    {views?.availability === 'observed' && views.change !== null
                      ? formatCompactNumberIntl(views.change)
                      : 'Unavailable'}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {translate('noTrend')}
          </p>
        )}
      </Card>
      <div className="mt-4">
        <Table
          columns={columns}
          emptyLabel="No posts for this account"
          getRowKey={(row) => row.postId}
          items={detail?.topPosts ?? []}
          label="Top posts"
          onRowClick={(row) => setSelectedPostId(row.postId)}
        />
      </div>
      <PostDetailPanel
        postId={selectedPostId}
        scope={PageScope.ANALYTICS}
        onClose={() => setSelectedPostId(null)}
      />
    </Container>
  );
}
