'use client';

import type {
  IEconomicsCostCategoryRow,
  IEconomicsCostModelRow,
} from '@genfeedai/contracts/interfaces';
import type { TableColumn } from '@props/ui/display/table.props';
import type { KPICardProps } from '@props/ui/kpi/kpi-card.props';
import { SeriesChart } from '@ui/analytics/charts/series/series-chart';
import AppTable from '@ui/display/table/Table';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Badge } from '@ui/primitives/badge';
import { Layers } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import EconomicsPeriodSelect from '../economics-period-select';
import {
  formatCount,
  formatUsd,
  formatUsdAxis,
} from '../economics-report.util';
import EconomicsReportError from '../economics-report-error';
import { useEconomicsReport } from '../use-economics-report';

const LLM_COLOR = 'var(--accent-violet)';
const MEDIA_COLOR = 'var(--accent-orange)';

function modelRowKey(row: IEconomicsCostModelRow): string {
  return `${row.kind}:${row.provider}:${row.model}`;
}

export default function EconomicsCostsReport() {
  const translate = useTranslations('pages.adminEconomics');
  const {
    data: report,
    error,
    isFetching,
    isLoading,
    periodDays,
    refetch,
    setPeriodDays,
  } = useEconomicsReport('costs', (service, query, signal) =>
    service.getCosts(query, signal),
  );

  const chartData = useMemo(
    () =>
      (report?.daily ?? []).map((point) => ({
        date: point.date,
        llm: point.llmCostUsd,
        media: point.mediaCostUsd,
      })),
    [report],
  );
  const series = useMemo(
    () => [
      {
        color: LLM_COLOR,
        key: 'llm',
        label: translate('costs.series.llm'),
      },
      {
        color: MEDIA_COLOR,
        key: 'media',
        label: translate('costs.series.media'),
      },
    ],
    [translate],
  );

  const items = useMemo<KPICardProps[]>(() => {
    const totals = report?.totals;
    return [
      {
        label: translate('costs.kpis.providerCost'),
        value: formatUsd(totals?.providerCostUsd ?? 0),
      },
      {
        description: translate('costs.kpis.llmDescription', {
          calls: formatCount(totals?.llmCalls ?? 0),
        }),
        label: translate('costs.kpis.llm'),
        value: formatUsd(totals?.llmCostUsd ?? 0),
      },
      {
        description: translate('costs.kpis.mediaDescription', {
          calls: formatCount(totals?.mediaGenerations ?? 0),
        }),
        label: translate('costs.kpis.media'),
        value: formatUsd(totals?.mediaCostUsd ?? 0),
      },
      {
        description: translate('costs.kpis.unpricedDescription', {
          byok: formatCount(totals?.byokCalls ?? 0),
        }),
        label: translate('costs.kpis.unpriced'),
        value: formatCount(totals?.unpricedCalls ?? 0),
        valueClassName: (totals?.unpricedCalls ?? 0) > 0 ? 'text-warning' : '',
      },
    ];
  }, [report, translate]);

  const modelColumns: TableColumn<IEconomicsCostModelRow>[] = [
    {
      header: translate('costs.columns.model'),
      key: 'model',
      subtext: (row) => row.provider,
    },
    {
      header: translate('costs.columns.kind'),
      key: 'kind',
      render: (row) => (
        <Badge variant="secondary">
          {translate(`costs.kinds.${row.kind}`)}
        </Badge>
      ),
    },
    {
      header: translate('costs.columns.calls'),
      key: 'calls',
      render: (row) => (
        <span className="tabular-nums">{formatCount(row.calls)}</span>
      ),
    },
    {
      header: translate('costs.columns.tokens'),
      key: 'promptTokens',
      render: (row) =>
        row.kind === 'llm' ? (
          <span className="tabular-nums">
            {formatCount(row.promptTokens)} /{' '}
            {formatCount(row.completionTokens)}
          </span>
        ) : (
          '—'
        ),
    },
    {
      header: translate('costs.columns.cost'),
      key: 'costUsd',
      render: (row) => (
        <span className="tabular-nums">{formatUsd(row.costUsd)}</span>
      ),
    },
    {
      header: translate('costs.columns.averageCost'),
      key: 'averageCostUsd',
      render: (row) => (
        <span className="tabular-nums">{formatUsd(row.averageCostUsd)}</span>
      ),
    },
    {
      header: translate('costs.columns.byok'),
      key: 'byokCalls',
      render: (row) => (
        <span className="tabular-nums">{formatCount(row.byokCalls)}</span>
      ),
    },
    {
      header: translate('costs.columns.unpriced'),
      key: 'unpricedCalls',
      render: (row) =>
        row.unpricedCalls > 0 ? (
          <Badge variant="warning">{formatCount(row.unpricedCalls)}</Badge>
        ) : (
          <span className="tabular-nums text-muted-foreground">0</span>
        ),
    },
  ];

  const categoryColumns: TableColumn<IEconomicsCostCategoryRow>[] = [
    {
      header: translate('costs.columns.category'),
      key: 'category',
    },
    {
      header: translate('costs.columns.generations'),
      key: 'generations',
      render: (row) => (
        <span className="tabular-nums">{formatCount(row.generations)}</span>
      ),
    },
    {
      header: translate('costs.columns.cost'),
      key: 'costUsd',
      render: (row) => (
        <span className="tabular-nums">{formatUsd(row.costUsd)}</span>
      ),
    },
  ];

  return (
    <AdminPageShell
      title={translate('costs.title')}
      icon={Layers}
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
          <KPISection
            className="mb-0"
            gridCols={{ desktop: 4, mobile: 1 }}
            isLoading={isLoading}
            items={items}
            size="md"
          />
          <WorkspaceSurface title={translate('costs.chart')}>
            <SeriesChart
              ariaLabel={translate('costs.chartLabel')}
              data={chartData}
              emptyLabel={translate('empty')}
              isLoading={isLoading}
              series={series}
              valueFormatter={formatUsdAxis}
              variant="stackedBar"
            />
          </WorkspaceSurface>
          <WorkspaceSurface framed={false} title={translate('costs.models')}>
            <AppTable<IEconomicsCostModelRow>
              ariaLabel={translate('costs.models')}
              columns={modelColumns}
              emptyLabel={translate('empty')}
              getRowKey={modelRowKey}
              isLoading={isLoading}
              items={report?.models ?? []}
            />
          </WorkspaceSurface>
          <WorkspaceSurface
            framed={false}
            title={translate('costs.categories')}
          >
            <AppTable<IEconomicsCostCategoryRow>
              ariaLabel={translate('costs.categories')}
              columns={categoryColumns}
              emptyLabel={translate('empty')}
              getRowKey={(row) => row.category}
              isLoading={isLoading}
              items={report?.mediaCategories ?? []}
            />
          </WorkspaceSurface>
        </div>
      )}
    </AdminPageShell>
  );
}
