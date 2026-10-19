'use client';

import { AlertCategory } from '@genfeedai/contracts';
import type {
  IEconomicsRevenueEvent,
  IEconomicsRevenueOrganizationRow,
} from '@genfeedai/contracts/interfaces';
import type { TableColumn } from '@props/ui/display/table.props';
import type { KPICardProps } from '@props/ui/kpi/kpi-card.props';
import { SeriesChart } from '@ui/analytics/charts/series/series-chart';
import AppTable from '@ui/display/table/Table';
import Alert from '@ui/feedback/alert/Alert';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Badge } from '@ui/primitives/badge';
import { TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import EconomicsPeriodSelect from '../economics-period-select';
import {
  formatCount,
  formatLedgerTimestamp,
  formatUsd,
  formatUsdAxis,
} from '../economics-report.util';
import EconomicsReportError from '../economics-report-error';
import { useEconomicsReport } from '../use-economics-report';

const SUBSCRIPTION_COLOR = 'hsl(var(--success))';
const CREDIT_PACK_COLOR = 'var(--accent-violet)';
const KNOWN_SOURCES = ['credit_purchase', 'subscription_invoice'];

export default function EconomicsRevenueReport() {
  const translate = useTranslations('pages.adminEconomics');
  const {
    data: report,
    error,
    isFetching,
    isLoading,
    periodDays,
    refetch,
    setPeriodDays,
  } = useEconomicsReport('revenue', (service, query, signal) =>
    service.getRevenue(query, signal),
  );

  const sourceLabel = (source: string) =>
    KNOWN_SOURCES.includes(source)
      ? translate(`revenue.sources.${source}`)
      : source;

  const chartData = useMemo(
    () =>
      (report?.daily ?? []).map((point) => ({
        creditPack: point.creditPackUsd,
        date: point.date,
        subscription: point.subscriptionUsd,
      })),
    [report],
  );
  const series = useMemo(
    () => [
      {
        color: SUBSCRIPTION_COLOR,
        key: 'subscription',
        label: translate('revenue.series.subscription'),
      },
      {
        color: CREDIT_PACK_COLOR,
        key: 'creditPack',
        label: translate('revenue.series.creditPack'),
      },
    ],
    [translate],
  );

  const items = useMemo<KPICardProps[]>(() => {
    const totals = report?.totals;
    return [
      {
        label: translate('revenue.kpis.revenue'),
        value: formatUsd(totals?.revenueUsd ?? 0),
      },
      {
        label: translate('revenue.kpis.payments'),
        value: formatCount(totals?.events ?? 0),
      },
      {
        label: translate('revenue.kpis.payingOrganizations'),
        value: formatCount(totals?.payingOrganizations ?? 0),
      },
      {
        label: translate('revenue.kpis.averagePayment'),
        value: formatUsd(totals?.averageRevenuePerEventUsd ?? 0),
      },
    ];
  }, [report, translate]);

  const organizationColumns: TableColumn<IEconomicsRevenueOrganizationRow>[] = [
    {
      header: translate('revenue.columns.organization'),
      key: 'label',
    },
    {
      header: translate('revenue.columns.events'),
      key: 'events',
      render: (row) => (
        <span className="tabular-nums">{formatCount(row.events)}</span>
      ),
    },
    {
      header: translate('revenue.columns.revenue'),
      key: 'revenueUsd',
      render: (row) => (
        <span className="tabular-nums">{formatUsd(row.revenueUsd)}</span>
      ),
    },
  ];

  const paymentColumns: TableColumn<IEconomicsRevenueEvent>[] = [
    {
      header: translate('revenue.columns.date'),
      key: 'occurredAt',
      render: (row) => (
        <span className="tabular-nums">
          {formatLedgerTimestamp(row.occurredAt)}
        </span>
      ),
    },
    {
      header: translate('revenue.columns.organization'),
      key: 'organizationLabel',
    },
    {
      header: translate('revenue.columns.source'),
      key: 'source',
      render: (row) => (
        <Badge variant="secondary">{sourceLabel(row.source)}</Badge>
      ),
    },
    {
      header: translate('revenue.columns.amount'),
      key: 'amountUsd',
      render: (row) => (
        <span className="tabular-nums">{formatUsd(row.amountUsd)}</span>
      ),
    },
    {
      header: translate('revenue.columns.stripeId'),
      key: 'stripeObjectId',
      render: (row) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.stripeObjectId}
        </span>
      ),
    },
  ];

  const ledgerStartedOn = report?.ledgerStartedAt?.slice(0, 10) ?? null;
  const startsAfterPeriod = Boolean(
    report && ledgerStartedOn && ledgerStartedOn > report.from,
  );

  return (
    <AdminPageShell
      title={translate('revenue.title')}
      icon={TrendingUp}
      onRefresh={() => refetch()}
      isRefreshing={isFetching && !isLoading}
      dropdowns={
        <EconomicsPeriodSelect value={periodDays} onChange={setPeriodDays} />
      }
    >
      {error ? (
        <EconomicsReportError error={error} />
      ) : (
        <div className="flex flex-col gap-6">
          {report && !report.ledgerStartedAt ? (
            <Alert type={AlertCategory.WARNING}>
              {translate('revenue.ledgerEmpty')}
            </Alert>
          ) : null}
          {report && startsAfterPeriod && ledgerStartedOn ? (
            <Alert type={AlertCategory.WARNING}>
              {translate('revenue.ledgerStartsLate', { date: ledgerStartedOn })}
            </Alert>
          ) : null}
          {report && report.nonUsdEvents > 0 ? (
            <Alert type={AlertCategory.INFO}>
              {translate('revenue.nonUsd', {
                count: formatCount(report.nonUsdEvents),
              })}
            </Alert>
          ) : null}
          <KPISection
            className="mb-0"
            gridCols={{ desktop: 4, mobile: 1 }}
            isLoading={isLoading}
            items={items}
            size="md"
          />
          <WorkspaceSurface title={translate('revenue.chart')}>
            <SeriesChart
              ariaLabel={translate('revenue.chartLabel')}
              data={chartData}
              emptyLabel={translate('empty')}
              isLoading={isLoading}
              series={series}
              valueFormatter={formatUsdAxis}
              variant="stackedBar"
            />
          </WorkspaceSurface>
          <WorkspaceSurface
            framed={false}
            title={translate('revenue.topOrganizations')}
          >
            <AppTable<IEconomicsRevenueOrganizationRow>
              ariaLabel={translate('revenue.topOrganizations')}
              columns={organizationColumns}
              emptyLabel={translate('empty')}
              getRowKey={(row) => row.id}
              isLoading={isLoading}
              items={report?.topOrganizations ?? []}
            />
          </WorkspaceSurface>
          <WorkspaceSurface
            framed={false}
            title={translate('revenue.latestPayments', {
              limit: report?.latestEventsLimit ?? 50,
            })}
          >
            <AppTable<IEconomicsRevenueEvent>
              ariaLabel={translate('revenue.latestPayments', {
                limit: report?.latestEventsLimit ?? 50,
              })}
              columns={paymentColumns}
              emptyLabel={translate('empty')}
              getRowKey={(row) => row.id}
              isLoading={isLoading}
              items={report?.latestEvents ?? []}
            />
          </WorkspaceSurface>
        </div>
      )}
    </AdminPageShell>
  );
}
