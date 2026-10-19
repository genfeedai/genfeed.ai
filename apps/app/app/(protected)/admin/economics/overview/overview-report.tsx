'use client';

import type { KPICardProps } from '@props/ui/kpi/kpi-card.props';
import { SeriesChart } from '@ui/analytics/charts/series/series-chart';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Gauge } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import EconomicsPeriodSelect from '../economics-period-select';
import {
  EMPTY_ECONOMICS_TOTALS,
  formatCount,
  formatMarginPercent,
  formatUsd,
  formatUsdAxis,
  percentChange,
} from '../economics-report.util';
import EconomicsReportError from '../economics-report-error';
import { useEconomicsReport } from '../use-economics-report';

const REVENUE_COLOR = 'hsl(var(--success))';
const COST_COLOR = 'hsl(var(--destructive))';
const CREDIT_COLOR = 'hsl(var(--foreground))';

export default function EconomicsOverviewReport() {
  const translate = useTranslations('pages.adminEconomics');
  const {
    data: report,
    error,
    isFetching,
    isLoading,
    periodDays,
    refetch,
    setPeriodDays,
  } = useEconomicsReport('overview', (service, query, signal) =>
    service.getOverview(query, signal),
  );

  const chartData = useMemo(
    () =>
      (report?.daily ?? []).map((point) => ({
        creditValue: point.creditValueUsd,
        date: point.date,
        providerCost: Number(
          (point.llmCostUsd + point.mediaCostUsd).toFixed(6),
        ),
        revenue: point.revenueUsd,
      })),
    [report],
  );

  const items = useMemo<KPICardProps[]>(() => {
    const totals = report?.totals ?? EMPTY_ECONOMICS_TOTALS;
    const before = report?.previousTotals ?? EMPTY_ECONOMICS_TOTALS;
    const previous = (value: number) =>
      translate('overview.kpis.previous', { value: formatUsd(value) });

    return [
      {
        description: translate('overview.kpis.revenueDescription', {
          events: formatCount(totals.revenueEvents),
          organizations: formatCount(totals.payingOrganizations),
        }),
        label: translate('overview.kpis.revenue'),
        trend: percentChange(totals.revenueUsd, before.revenueUsd),
        trendLabel: previous(before.revenueUsd),
        value: formatUsd(totals.revenueUsd),
      },
      {
        description: translate('overview.kpis.providerCostDescription', {
          llm: formatUsd(totals.llmCostUsd),
          media: formatUsd(totals.mediaCostUsd),
        }),
        label: translate('overview.kpis.providerCost'),
        value: formatUsd(totals.providerCostUsd),
      },
      {
        description: translate('overview.kpis.grossMarginDescription', {
          percent: formatMarginPercent(totals.grossMarginPercent),
        }),
        label: translate('overview.kpis.grossMargin'),
        value: formatUsd(totals.grossMarginUsd),
        valueClassName: totals.grossMarginUsd < 0 ? 'text-destructive' : '',
      },
      {
        description: translate('overview.kpis.creditValueDescription', {
          credits: formatCount(Math.round(totals.creditsConsumed)),
          organizations: formatCount(totals.activeOrganizations),
        }),
        label: translate('overview.kpis.creditValue'),
        trend: percentChange(totals.creditValueUsd, before.creditValueUsd),
        trendLabel: previous(before.creditValueUsd),
        value: formatUsd(totals.creditValueUsd),
      },
      {
        description: translate('overview.kpis.pricingMarginDescription', {
          percent: formatMarginPercent(totals.pricingMarginPercent),
        }),
        label: translate('overview.kpis.pricingMargin'),
        value: formatUsd(totals.pricingMarginUsd),
        valueClassName: totals.pricingMarginUsd < 0 ? 'text-destructive' : '',
      },
      {
        description: translate('overview.kpis.callsDescription', {
          llm: formatCount(totals.llmCalls),
          media: formatCount(totals.mediaGenerations),
        }),
        label: translate('overview.kpis.calls'),
        value: formatCount(totals.llmCalls + totals.mediaGenerations),
      },
    ];
  }, [report, translate]);

  const revenueCostSeries = useMemo(
    () => [
      {
        color: REVENUE_COLOR,
        key: 'revenue',
        label: translate('overview.series.revenue'),
      },
      {
        color: COST_COLOR,
        key: 'providerCost',
        label: translate('overview.series.providerCost'),
      },
    ],
    [translate],
  );
  const creditsCostSeries = useMemo(
    () => [
      {
        color: CREDIT_COLOR,
        key: 'creditValue',
        label: translate('overview.series.creditValue'),
      },
      {
        color: COST_COLOR,
        key: 'providerCost',
        label: translate('overview.series.providerCost'),
      },
    ],
    [translate],
  );

  return (
    <AdminPageShell
      title={translate('overview.title')}
      icon={Gauge}
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
            gridCols={{ desktop: 3, mobile: 1 }}
            isLoading={isLoading}
            items={items}
            size="md"
          />
          <WorkspaceSurface title={translate('overview.chartRevenueCost')}>
            <SeriesChart
              ariaLabel={translate('overview.chartRevenueCostLabel')}
              data={chartData}
              emptyLabel={translate('overview.chartEmpty')}
              isLoading={isLoading}
              series={revenueCostSeries}
              valueFormatter={formatUsdAxis}
              variant="area"
            />
          </WorkspaceSurface>
          <WorkspaceSurface title={translate('overview.chartCredits')}>
            <SeriesChart
              ariaLabel={translate('overview.chartCreditsLabel')}
              data={chartData}
              emptyLabel={translate('overview.chartEmpty')}
              isLoading={isLoading}
              series={creditsCostSeries}
              valueFormatter={formatUsdAxis}
              variant="area"
            />
          </WorkspaceSurface>
          <p className="text-sm text-muted-foreground">
            {translate('overview.definitions')}
          </p>
        </div>
      )}
    </AdminPageShell>
  );
}
