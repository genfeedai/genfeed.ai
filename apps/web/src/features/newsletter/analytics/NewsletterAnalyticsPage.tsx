'use client';

import { useAnalyticsContext } from '@contexts/analytics/analytics-context';
import type {
  INewsletterActivityItem,
  INewsletterSendReport,
  INewsletterSourceCount,
} from '@genfeedai/contracts/interfaces';
import { getDateRangeWithDefaults } from '@genfeedai/helpers/utils/date-range.util';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import type { TableColumn } from '@props/ui/display/table.props';
import AppTable from '@ui/display/table/Table';
import TableDateCell from '@ui/display/table/TableDateCell';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import { Badge } from '@ui/primitives/badge';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useNewsletterAnalytics } from '@/features/newsletter/hooks/use-newsletter-module';
import NewsletterBrandGate from '@/features/newsletter/NewsletterBrandGate';
import type {
  NewsletterAnalyticsRange,
  NewsletterLinkRow,
} from '@/features/newsletter/props/newsletter.props';

const PERCENT_FORMAT = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  style: 'percent',
});

/**
 * Newsletter results for one brand (#9727), inside the Analytics layout: its
 * date range and refresh drive every number here. Opens are an estimate
 * because mail clients preload images; clicks come from first-party redirects.
 */
export default function NewsletterAnalyticsPage() {
  const translate = useTranslations('pages.publishing.newsletter');
  const { brandId } = useCollectionScope();
  const { dateRange, refreshTrigger } = useAnalyticsContext();
  const { startDate, endDate } = getDateRangeWithDefaults(
    dateRange.startDate ?? undefined,
    dateRange.endDate ?? undefined,
  );
  const range: NewsletterAnalyticsRange = {
    from: `${startDate}T00:00:00.000Z`,
    refreshKey: refreshTrigger,
    to: `${endDate}T23:59:59.999Z`,
  };
  const analytics = useNewsletterAnalytics(brandId, range);
  const data = analytics.data;

  const sendColumns = useMemo(
    (): TableColumn<INewsletterSendReport>[] => [
      { header: translate('analytics.columns.issue'), key: 'subject' },
      {
        header: translate('analytics.columns.status'),
        key: 'status',
        render: (send) => (
          <Badge status={send.status}>
            {translate(`sendStatus.${send.status}`)}
          </Badge>
        ),
      },
      {
        header: translate('analytics.columns.sentAt'),
        key: 'scheduledFor',
        render: (send) => (
          <TableDateCell value={send.startedAt ?? send.scheduledFor} />
        ),
      },
      { header: translate('analytics.columns.delivered'), key: 'delivered' },
      {
        header: translate('analytics.columns.opens'),
        key: 'uniqueOpens',
        render: (send) =>
          `${send.uniqueOpens} (${PERCENT_FORMAT.format(send.delivered ? send.uniqueOpens / send.delivered : 0)})`,
      },
      {
        header: translate('analytics.columns.clicks'),
        key: 'uniqueClicks',
        render: (send) =>
          `${send.uniqueClicks} (${PERCENT_FORMAT.format(send.delivered ? send.uniqueClicks / send.delivered : 0)})`,
      },
      {
        header: translate('analytics.columns.unsubscribed'),
        key: 'unsubscribed',
      },
      { header: translate('analytics.columns.bounced'), key: 'bounced' },
    ],
    [translate],
  );

  const linkColumns = useMemo(
    (): TableColumn<NewsletterLinkRow>[] => [
      {
        header: translate('analytics.columns.link'),
        key: 'url',
        subtext: (link) => link.subject,
      },
      {
        header: translate('analytics.columns.uniqueClicks'),
        key: 'uniqueClicks',
      },
      {
        header: translate('analytics.columns.totalClicks'),
        key: 'totalClicks',
      },
    ],
    [translate],
  );

  const sourceColumns = useMemo(
    (): TableColumn<INewsletterSourceCount>[] => [
      {
        header: translate('analytics.columns.source'),
        key: 'source',
        render: (row) => translate(`source.${row.source}`),
      },
      { header: translate('analytics.columns.newSubscribers'), key: 'count' },
    ],
    [translate],
  );

  const activityColumns = useMemo(
    (): TableColumn<INewsletterActivityItem>[] => [
      {
        header: translate('analytics.columns.event'),
        key: 'type',
        render: (item) => translate(`activity.${item.type}`),
        subtext: (item) => item.subject ?? undefined,
      },
      {
        header: translate('analytics.columns.when'),
        key: 'occurredAt',
        render: (item) => <TableDateCell value={item.occurredAt} />,
      },
    ],
    [translate],
  );

  const links: NewsletterLinkRow[] = (data?.topLinks ?? []).map((link) => ({
    id: `${link.sendId}-${link.index}`,
    subject: link.subject,
    totalClicks: link.totalClicks,
    uniqueClicks: link.uniqueClicks,
    url: link.url,
  }));
  const growth = (data?.growth ?? []).reduce(
    (total, day) => ({
      subscribed: total.subscribed + day.subscribed,
      unsubscribed: total.unsubscribed + day.unsubscribed,
    }),
    { subscribed: 0, unsubscribed: 0 },
  );

  if (!brandId) {
    return <NewsletterBrandGate title={translate('analytics.title')} />;
  }

  const totals = data?.totals;
  return (
    <>
      <KPISection
        gridCols={{ desktop: 5, mobile: 2 }}
        isLoading={analytics.isLoading}
        error={analytics.isError ? translate('analytics.loadError') : null}
        items={[
          {
            label: translate('analytics.kpi.subscribers'),
            value: totals?.activeSubscribers ?? 0,
          },
          {
            label: translate('analytics.kpi.netGrowth'),
            value: growth.subscribed - growth.unsubscribed,
          },
          {
            label: translate('analytics.kpi.openRate'),
            value: PERCENT_FORMAT.format(totals?.openRate ?? 0),
          },
          {
            label: translate('analytics.kpi.clickRate'),
            value: PERCENT_FORMAT.format(totals?.clickRate ?? 0),
          },
          {
            label: translate('analytics.kpi.unsubscribed'),
            value: totals?.unsubscribed ?? 0,
          },
        ]}
        size="sm"
      />
      <p className="mb-6 text-sm text-muted-foreground">
        {translate('analytics.openNote')}
      </p>
      <div className="flex flex-col gap-8">
        <AppTable<INewsletterSendReport>
          columns={sendColumns}
          emptyLabel={translate('analytics.emptySends')}
          getRowKey={(send) => send.id}
          isLoading={analytics.isLoading}
          items={data?.sends ?? []}
          label={translate('analytics.sends')}
        />
        <AppTable<NewsletterLinkRow>
          columns={linkColumns}
          emptyLabel={translate('analytics.emptyLinks')}
          getRowKey={(link) => link.id}
          isLoading={analytics.isLoading}
          items={links}
          label={translate('analytics.topLinks')}
        />
        <div className="grid gap-8 lg:grid-cols-2">
          <AppTable<INewsletterSourceCount>
            columns={sourceColumns}
            emptyLabel={translate('analytics.emptySources')}
            getRowKey={(row) => row.source}
            isLoading={analytics.isLoading}
            items={data?.sources ?? []}
            label={translate('analytics.sources')}
          />
          <AppTable<INewsletterActivityItem>
            columns={activityColumns}
            emptyLabel={translate('analytics.emptyActivity')}
            getRowKey={(item, index) =>
              `${item.type}-${item.occurredAt}-${index}`
            }
            isLoading={analytics.isLoading}
            items={data?.recentActivity ?? []}
            label={translate('analytics.activity')}
          />
        </div>
      </div>
    </>
  );
}
