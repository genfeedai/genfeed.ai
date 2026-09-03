'use client';

import { useAnalyticsContext } from '@contexts/analytics/analytics-context';
import { AnalyticsMetric, ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type {
  IAccountAnalyticsDetail,
  ITopContent,
} from '@genfeedai/contracts/interfaces';
import { formatCompactNumberIntl } from '@helpers/formatting/format/format.helper';
import { getDateRangeWithDefaults } from '@helpers/utils/date-range.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import type { TableColumn } from '@props/ui/display/table.props';
import { AnalyticsService } from '@services/analytics/analytics.service';
import Card from '@ui/card/Card';
import Table from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

export default function AnalyticsAccountDetail() {
  const translate = useTranslations('pages.analytics.accounts');
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const credentialId = params.id;
  const { brandId } = useCollectionScope();
  const { dateRange } = useAnalyticsContext();
  const getService = useAuthedService((token: string) =>
    AnalyticsService.getInstance(token),
  );
  const [detail, setDetail] = useState<IAccountAnalyticsDetail | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const service = await getService();
      const { startDate, endDate } = getDateRangeWithDefaults(
        dateRange.startDate ?? undefined,
        dateRange.endDate ?? undefined,
      );
      const data = (await service.getAccountAnalyticsDetail(credentialId, {
        brandId: brandId || undefined,
        endDate,
        startDate,
      })) as IAccountAnalyticsDetail;
      if (!controller.signal.aborted) {
        setDetail(data);
      }
    })();
    return () => controller.abort();
  }, [
    brandId,
    credentialId,
    dateRange.endDate,
    dateRange.startDate,
    getService,
  ]);

  const title =
    detail?.identity.label || detail?.identity.externalHandle || 'Account';
  const columns: TableColumn<ITopContent>[] = useMemo(
    () => [
      {
        key: 'title',
        header: 'Post',
        render: (row) => row.title || row.postId,
      },
      {
        key: 'views',
        header: 'Views',
        render: (row) => formatCompactNumberIntl(row.views),
      },
      {
        key: 'likes',
        header: 'Likes',
        render: (row) => formatCompactNumberIntl(row.likes),
      },
    ],
    [],
  );

  return (
    <Container
      label={title}
      right={
        <Button
          label="Manage account"
          variant={ButtonVariant.SECONDARY}
          onClick={() =>
            router.push(
              detail?.identity.manageHref ?? APP_ROUTES.SETTINGS.SOCIAL,
            )
          }
        />
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
        {(detail?.metrics ?? []).map((metric) => (
          <Card key={metric.metric}>
            <p className="text-sm text-muted-foreground">{metric.metric}</p>
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
        />
      </div>
    </Container>
  );
}
