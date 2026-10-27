'use client';

import { useAnalyticsContext } from '@contexts/analytics/analytics-context';
import type {
  IXActivityRow,
  IXGrowthReport,
} from '@genfeedai/contracts/interfaces';
import { formatCompactNumberIntl } from '@helpers/formatting/format/format.helper';
import { getDateRangeWithDefaults } from '@helpers/utils/date-range.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { TableColumn } from '@props/ui/display/table.props';
import { AnalyticsService } from '@services/analytics/analytics.service';
import { logger } from '@services/core/logger.service';
import Card from '@ui/card/Card';
import Table from '@ui/display/table/Table';
import LoadingState from '@ui/feedback/LoadingState';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

interface AnalyticsAccountXGrowthProps {
  brandId: string;
  credentialId: string;
}

const INSUFFICIENT_REASON_KEY = {
  low_coverage: 'xGrowthReasonLowCoverage',
  no_snapshots: 'xGrowthReasonNoSnapshots',
  reset_leaves_one_snapshot: 'xGrowthReasonReset',
  single_snapshot: 'xGrowthReasonSingleSnapshot',
} as const;

const KIND_KEY = {
  post: 'xGrowthKindPost',
  quote: 'xGrowthKindQuote',
  reply: 'xGrowthKindReply',
  unknown: 'xGrowthKindUnknown',
} as const;

function formatChange(change: number): string {
  const formatted = formatCompactNumberIntl(Math.abs(change));
  if (change > 0) {
    return `+${formatted}`;
  }
  return change < 0 ? `-${formatted}` : formatted;
}

/**
 * What one connected X account published in the selected period, how each
 * publication did, and how its followers moved. Every figure shows its own
 * state; a missing one reads as unavailable, never as zero.
 */
export default function AnalyticsAccountXGrowth({
  brandId,
  credentialId,
}: AnalyticsAccountXGrowthProps) {
  const translate = useTranslations('pages.analytics.accounts');
  const { dateRange, refreshTrigger } = useAnalyticsContext();
  const getService = useAuthedService((token: string) =>
    AnalyticsService.getInstance(token),
  );
  const [report, setReport] = useState<IXGrowthReport | null>(null);
  const [isFailed, setIsFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { startDate, endDate } = getDateRangeWithDefaults(
    dateRange.startDate ?? undefined,
    dateRange.endDate ?? undefined,
  );

  useEffect(() => {
    if (refreshTrigger < 0) {
      return;
    }
    const controller = new AbortController();
    void (async () => {
      setIsFailed(false);
      setIsLoading(true);
      setReport(null);
      try {
        const service = await getService();
        const data = await service.getXGrowthReport(credentialId, {
          brandId,
          endDate,
          startDate,
        });
        if (!controller.signal.aborted) {
          setReport(data);
        }
      } catch (requestError) {
        if (!controller.signal.aborted) {
          logger.error('Failed to fetch X growth report', requestError);
          setIsFailed(true);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    })();
    return () => controller.abort();
  }, [brandId, credentialId, endDate, getService, refreshTrigger, startDate]);

  const columns: TableColumn<IXActivityRow>[] = useMemo(
    () => [
      {
        header: translate('xGrowthColPost'),
        key: 'text',
        render: (row) =>
          row.url ? (
            <a
              className="hover:underline"
              href={row.url}
              rel="noreferrer"
              target="_blank"
            >
              {row.text}
            </a>
          ) : (
            row.text
          ),
      },
      {
        header: translate('xGrowthColType'),
        key: 'kind',
        render: (row) => translate(KIND_KEY[row.kind]),
      },
      {
        header: translate('xGrowthColMetrics'),
        key: 'metricState',
        render: (row) => {
          const views = row.metrics?.views;
          if (row.metricState === 'observed' && views?.value != null) {
            return translate('xGrowthMetricsObserved', {
              views: formatCompactNumberIntl(views.value),
            });
          }
          if (row.metricState === 'partial') {
            return translate('xGrowthMetricsPartial');
          }
          return translate(
            row.metricState === 'pending'
              ? 'xGrowthMetricsPending'
              : 'xGrowthMetricsUnavailable',
          );
        },
        subtext: (row) =>
          row.isStale ? translate('xGrowthMetricsStale') : null,
      },
      {
        header: translate('xGrowthColApproval'),
        key: 'approval',
        render: (row) =>
          row.approval?.decision ?? translate('xGrowthApprovalNone'),
      },
      {
        header: translate('xGrowthColSent'),
        key: 'sendReceipt',
        render: (row) =>
          row.sendReceipt?.externalId ?? translate('xGrowthSentNone'),
      },
    ],
    [translate],
  );

  if (isLoading) {
    return <LoadingState />;
  }

  if (isFailed || !report) {
    return (
      <p className="text-sm text-muted-foreground" role="alert">
        {translate('xGrowthLoadError')}
      </p>
    );
  }

  const { growth } = report;

  return (
    <section aria-label={translate('xGrowthTitle')} className="space-y-4">
      <h2 className="text-lg">{translate('xGrowthTitle')}</h2>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-sm text-muted-foreground">
            {translate('xGrowthFollowers')}
          </p>
          {growth.state === 'observed' ? (
            <>
              <p className="text-2xl">
                {translate('xGrowthFollowerChange', {
                  change: formatChange(growth.delta),
                })}
              </p>
              <p className="text-sm">
                {translate('xGrowthFollowerRange', {
                  end: formatCompactNumberIntl(growth.endFollowers),
                  endDate: growth.endDate,
                  observedDays: growth.observedDays,
                  periodDays: growth.periodDays,
                  start: formatCompactNumberIntl(growth.startFollowers),
                  startDate: growth.startDate,
                })}
              </p>
              <p className="text-sm text-muted-foreground">
                {translate('xGrowthCorrelation')}
              </p>
            </>
          ) : (
            <>
              <p className="text-2xl">{translate('xGrowthNotEnough')}</p>
              <p className="text-sm">
                {translate(INSUFFICIENT_REASON_KEY[growth.reason], {
                  observedDays: growth.observedDays,
                  periodDays: growth.periodDays,
                })}
              </p>
            </>
          )}
          {growth.resets.map((reset) => (
            <p key={reset.date} className="text-sm text-muted-foreground">
              {translate('xGrowthReset', {
                date: reset.date,
                from: formatCompactNumberIntl(reset.from),
                to: formatCompactNumberIntl(reset.to),
              })}
            </p>
          ))}
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">
            {translate('xGrowthConversions')}
          </p>
          <p className="text-sm">
            {translate('xGrowthConversionsUnavailable')}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">
            {translate('xGrowthProfileTraffic')}
          </p>
          <p className="text-sm">
            {translate('xGrowthProfileTrafficUnavailable')}
          </p>
        </Card>
      </div>
      {report.activity.isTruncated ? (
        <p className="text-sm text-muted-foreground">
          {translate('xGrowthTruncated')}
        </p>
      ) : null}
      <Table
        columns={columns}
        emptyLabel={translate('xGrowthActivityEmpty')}
        getRowKey={(row) => row.postId}
        items={report.activity.rows}
        label={translate('xGrowthActivity')}
      />
    </section>
  );
}
