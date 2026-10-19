'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type {
  ArticleTraffic,
  ArticleTrafficPeriod,
} from '@genfeedai/contracts/interfaces/content/article-traffic.interface';
import { formatDate } from '@helpers/formatting/date/date.helper';
import { capitalize } from '@helpers/formatting/format/format.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import type { ArticleTrafficPanelProps } from '@props/content/article-traffic.props';
import { ArticlesService } from '@services/content/articles.service';
import Badge from '@ui/display/badge/Badge';
import TableRowSummary from '@ui/display/table/TableRowSummary';
import { Button } from '@ui/primitives/button';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

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
  const getService = useAuthedService(
    useCallback((token: string) => ArticlesService.getInstance(token), []),
  );
  const [period, setPeriod] = useState<ArticleTrafficPeriod>('30d');
  const [traffic, setTraffic] = useState<ArticleTraffic | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [reload, setReload] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Reload and collection scope deliberately invalidate the in-flight report.
  useEffect(() => {
    if (!organizationId) {
      setIsLoading(false);
      return;
    }
    const controller = new AbortController();
    setIsLoading(true);
    setTraffic(null);
    setIsError(false);
    void (async () => {
      try {
        const service = await getService();
        if (controller.signal.aborted) return;
        const data = await service.getWebsiteTraffic(
          article.id,
          period,
          controller.signal,
        );
        if (!controller.signal.aborted) setTraffic(data);
      } catch {
        if (!controller.signal.aborted) setIsError(true);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [article.id, period, getService, organizationId, brandId, reload]);

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
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label={translate('periodLabel')}
        >
          {PERIODS.map((option) => (
            <Button
              key={option}
              aria-pressed={period === option}
              variant={
                period === option
                  ? ButtonVariant.DEFAULT
                  : ButtonVariant.SECONDARY
              }
              onClick={() => setPeriod(option)}
            >
              {translate(`period.${option}`)}
            </Button>
          ))}
        </div>
        {isLoading ? <p role="status">{translate('loading')}</p> : null}
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
              onClick={() => setReload((value) => value + 1)}
            >
              {translate('retry')}
            </Button>
          </div>
        ) : null}
        {traffic?.status === 'available' ? (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm text-muted-foreground">
                  {translate('views')}
                </dt>
                <dd className="text-2xl font-semibold">
                  {traffic.totalViews?.toLocaleString(locale)}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">
                  {translate('resourceActions')}
                </dt>
                <dd className="text-2xl font-semibold">
                  {traffic.totalResourceClicks?.toLocaleString(locale)}
                </dd>
              </div>
            </dl>
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
