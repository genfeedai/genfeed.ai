'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { ArticleTrafficPeriod } from '@genfeedai/contracts/interfaces/content/article-traffic.interface';
import { formatDate } from '@helpers/formatting/date/date.helper';
import { capitalize } from '@helpers/formatting/format/format.helper';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { ArticlesService } from '@services/content/articles.service';
import MetricCard from '@ui/cards/metric-card/MetricCard';
import { MetricCardGrid } from '@ui/cards/metric-card/MetricCardGrid';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import TableRowSummary from '@ui/display/table/TableRowSummary';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { SegmentedControl } from '@ui/primitives/segmented-control';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import type { ArticleTrafficPanelProps } from '@/features/articles/props/article-traffic.props';

const ArticleTrafficChart = dynamic(() => import('./article-traffic-chart'), {
  ssr: false,
});
const PERIODS: ReadonlyArray<ArticleTrafficPeriod> = [
  '7d',
  '30d',
  '90d',
  'all',
];

/**
 * An article's summary and website traffic in the right context sidebar. The
 * article's own editor stays one click away through the Open link.
 */
export default function ArticleTrafficPanel({
  article,
  openHref,
  openLabel,
}: ArticleTrafficPanelProps) {
  const translate = useTranslations('pages.articles.traffic');
  const translateList = useTranslations('pages.articles.list');
  const locale = useLocale();
  const { organizationId, brandId } = useCollectionScope();
  const [period, setPeriod] = useState<ArticleTrafficPeriod>('30d');

  // Cached per article, range and scope: reopening an article, or going back
  // to a range already viewed, paints its traffic at once while it refreshes.
  const trafficQuery = useAuthedQuery({
    enabled: Boolean(organizationId),
    queryFn: (service, signal) =>
      service.getWebsiteTraffic(article.id, period, signal),
    queryKey: [
      'article-traffic',
      article.id,
      period,
      { brandId: brandId ?? null, organizationId },
    ],
    service: (token: string) => ArticlesService.getInstance(token),
  });
  const traffic = trafficQuery.data ?? null;
  const isLoading = Boolean(organizationId) && trafficQuery.isPending;
  const { isError, refetch } = trafficQuery;

  return (
    <div data-testid="article-traffic-panel">
      <TableRowSummary
        badges={
          article.status ? (
            <Badge status={article.status}>{capitalize(article.status)}</Badge>
          ) : undefined
        }
        facts={[
          {
            id: 'author',
            label: translateList('author'),
            value: article.author,
          },
          {
            id: 'words',
            label: translateList('words'),
            value: article.wordCount ? String(article.wordCount) : undefined,
          },
          {
            id: 'created',
            label: translateList('created'),
            value: article.createdAt
              ? formatDate(article.createdAt)
              : undefined,
          },
        ]}
        openHref={openHref}
        openLabel={openLabel}
      >
        <h3 className="text-sm font-semibold">{translate('title')}</h3>
        <SegmentedControl
          appearance="chip"
          ariaLabel={translate('periodLabel')}
          onValueChange={setPeriod}
          options={PERIODS.map((option) => ({
            label: translate(`period.${option}`),
            value: option,
          }))}
          value={period}
        />
        {isLoading ? (
          <SkeletonCard
            label={translate('loading')}
            showActions={false}
            showImage={false}
          />
        ) : null}
        {isError || traffic?.status === 'unavailable' ? (
          <div className="space-y-3" role="status">
            <p>
              {isError
                ? translate('loadError')
                : translate(
                    `unavailable.${traffic?.reason ?? 'upstream_error'}`,
                  )}
            </p>
            <Button
              variant={ButtonVariant.SECONDARY}
              onClick={() => {
                void refetch();
              }}
            >
              {translate('retry')}
            </Button>
          </div>
        ) : null}
        {traffic?.status === 'available' ? (
          <div className="space-y-4">
            <MetricCardGrid columns={2}>
              <MetricCard
                appearance="inset"
                label={translate('views')}
                size="sm"
                value={traffic.totalViews?.toLocaleString(locale)}
              />
              <MetricCard
                appearance="inset"
                label={translate('resourceActions')}
                size="sm"
                value={traffic.totalResourceClicks?.toLocaleString(locale)}
              />
            </MetricCardGrid>
            <ArticleTrafficChart days={traffic.days} />
            <p className="text-xs text-muted-foreground">
              {translate('methodology')}
            </p>
          </div>
        ) : null}
      </TableRowSummary>
    </div>
  );
}
