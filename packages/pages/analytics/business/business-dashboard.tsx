'use client';

import { AlertCategory } from '@genfeedai/enums';
import { formatCompactNumberIntl } from '@helpers/formatting/format/format.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import type { IBusinessAnalytics } from '@services/analytics/analytics.service';
import { AnalyticsService } from '@services/analytics/analytics.service';
import Card from '@ui/card/Card';
import Alert from '@ui/feedback/alert/Alert';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import Loading from '@ui/loading/default/Loading';
import { useCallback } from 'react';
import {
  HiOutlineBanknotes,
  HiOutlineCreditCard,
  HiOutlineCube,
  HiOutlinePhoto,
  HiOutlineSparkles,
} from 'react-icons/hi2';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value);
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return 'N/A';
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

interface LeaderTableProps {
  title: string;
  leaders: Array<{
    organizationId: string;
    organizationName: string;
    amount?: number;
    count?: number;
  }>;
  valueFormatter: (item: { amount?: number; count?: number }) => string;
  valueLabel: string;
}

function LeaderTable({
  title,
  leaders,
  valueFormatter,
  valueLabel,
}: LeaderTableProps) {
  return (
    <Card bodyClassName="gap-0 p-4" className="border-border">
      <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
      {leaders.length === 0 ? (
        <p className="text-sm text-muted-foreground">No data available</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="pb-2 text-left font-medium text-muted-foreground">
                #
              </th>
              <th className="pb-2 text-left font-medium text-muted-foreground">
                Organization
              </th>
              <th className="pb-2 text-right font-medium text-muted-foreground">
                {valueLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {leaders.map((leader, index) => (
              <tr
                key={leader.organizationId}
                className="border-b border-border/50 last:border-0"
              >
                <td className="py-2 text-muted-foreground">{index + 1}</td>
                <td className="py-2 font-medium text-foreground">
                  {leader.organizationName}
                </td>
                <td className="py-2 text-right tabular-nums text-foreground">
                  {valueFormatter(leader)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

interface ComparisonCardProps {
  title: string;
  leftLabel: string;
  leftValue: string;
  rightLabel: string;
  rightValue: string;
  difference?: string;
}

function ComparisonCard({
  title,
  leftLabel,
  leftValue,
  rightLabel,
  rightValue,
  difference,
}: ComparisonCardProps) {
  return (
    <Card bodyClassName="gap-0 p-4" className="border-border">
      <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">{leftLabel}</p>
          <p className="text-lg font-semibold tabular-nums text-foreground">
            {leftValue}
          </p>
        </div>
        <div className="text-muted-foreground">vs</div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">{rightLabel}</p>
          <p className="text-lg font-semibold tabular-nums text-foreground">
            {rightValue}
          </p>
        </div>
      </div>
      {difference && (
        <p className="mt-2 text-xs text-muted-foreground">{difference}</p>
      )}
    </Card>
  );
}

interface DailySeriesChartProps {
  title: string;
  data: Array<{ date: string; amount?: number; count?: number }>;
  valueKey: 'amount' | 'count';
  formatter: (value: number) => string;
}

function DailySeriesChart({
  title,
  data,
  valueKey,
  formatter,
}: DailySeriesChartProps) {
  if (data.length === 0) {
    return (
      <Card bodyClassName="gap-0 p-4" className="border-border">
        <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">No data available</p>
      </Card>
    );
  }

  const values = data.map((d) => (d[valueKey] as number) ?? 0);
  const maxValue = Math.max(...values, 1);

  return (
    <Card bodyClassName="gap-0 p-4" className="border-border">
      <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
      <div className="flex h-32 items-end gap-px">
        {data.map((point) => {
          const value = (point[valueKey] as number) ?? 0;
          const height = (value / maxValue) * 100;
          return (
            <div
              key={point.date}
              className="group relative flex-1"
              title={`${point.date}: ${formatter(value)}`}
            >
              <div
                className="w-full rounded-t bg-primary/60 transition-colors group-hover:bg-primary"
                style={{ height: `${Math.max(height, 2)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{data[0]?.date?.slice(5)}</span>
        <span>{data[data.length - 1]?.date?.slice(5)}</span>
      </div>
    </Card>
  );
}

interface ProjectionCardProps {
  projections: IBusinessAnalytics['projections'];
}

function ProjectionCard({ projections }: ProjectionCardProps) {
  if (projections.insufficientData) {
    return (
      <Card bodyClassName="gap-0 p-4" className="border-border">
        <h3 className="mb-2 text-sm font-semibold text-foreground">
          30-Day Projections
        </h3>
        <p className="text-sm text-muted-foreground">
          Insufficient data for projections. At least 2 weeks of history
          required.
        </p>
      </Card>
    );
  }

  return (
    <Card bodyClassName="gap-0 p-4" className="border-border">
      <h3 className="mb-1 text-sm font-semibold text-foreground">
        30-Day Projections
      </h3>
      <p className="mb-3 text-[10px] text-muted-foreground uppercase tracking-wider">
        Estimates based on recent weekly growth
      </p>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Revenue</p>
          <p className="text-lg font-semibold tabular-nums text-foreground">
            {projections.revenueNext30d !== null
              ? formatCurrency(projections.revenueNext30d)
              : 'N/A'}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Credits</p>
          <p className="text-lg font-semibold tabular-nums text-foreground">
            {projections.creditsNext30d !== null
              ? formatCompactNumberIntl(projections.creditsNext30d)
              : 'N/A'}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Ingredients</p>
          <p className="text-lg font-semibold tabular-nums text-foreground">
            {projections.ingredientsNext30d !== null
              ? formatCompactNumberIntl(projections.ingredientsNext30d)
              : 'N/A'}
          </p>
        </div>
      </div>
    </Card>
  );
}

export default function BusinessDashboard() {
  const getAnalyticsService = useAuthedService((token) =>
    AnalyticsService.getInstance(token),
  );

  const fetcher = useCallback(async () => {
    const service = await getAnalyticsService();
    return service.getBusinessAnalytics();
  }, [getAnalyticsService]);

  const { data, isLoading, error } = useResource<IBusinessAnalytics>(fetcher, {
    cacheKey: 'business-analytics',
    cacheTimeMs: 5 * 60 * 1000,
    errorMessage: 'Failed to load business analytics',
  });

  if (isLoading && !data) {
    return <Loading />;
  }

  if (error && !data) {
    return (
      <Alert type={AlertCategory.ERROR}>
        Failed to load business analytics. Please try again.
      </Alert>
    );
  }

  if (!data) {
    return (
      <Alert type={AlertCategory.WARNING}>
        No business analytics data available.
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Revenue KPIs */}
      <KPISection
        title="Revenue"
        items={[
          {
            icon: HiOutlineBanknotes,
            label: 'Today',
            trend: data.revenue.wowGrowth,
            trendLabel: 'WoW',
            value: formatCurrency(data.revenue.today),
          },
          {
            icon: HiOutlineBanknotes,
            label: 'Last 7 Days',
            value: formatCurrency(data.revenue.last7d),
          },
          {
            icon: HiOutlineBanknotes,
            label: 'Last 30 Days',
            value: formatCurrency(data.revenue.last30d),
          },
          {
            icon: HiOutlineBanknotes,
            label: 'Month to Date',
            value: formatCurrency(data.revenue.mtd),
          },
        ]}
        gridCols={{ desktop: 4, mobile: 2, tablet: 2 }}
        isLoading={isLoading}
      />

      {/* Credits KPIs */}
      <KPISection
        title="Credits"
        items={[
          {
            icon: HiOutlineCreditCard,
            label: 'Credits Sold',
            trend: data.credits.wowGrowth,
            trendLabel: 'WoW',
            value: formatCompactNumberIntl(data.credits.sold),
          },
          {
            icon: HiOutlineSparkles,
            label: 'Credits Consumed',
            value: formatCompactNumberIntl(data.credits.consumed),
          },
        ]}
        gridCols={{ desktop: 2, mobile: 1, tablet: 2 }}
        isLoading={isLoading}
      />

      {/* Ingredients KPIs */}
      <KPISection
        title="Ingredients Generated"
        items={[
          {
            icon: HiOutlineCube,
            label: 'Today',
            trend: data.ingredients.wowGrowth,
            trendLabel: 'WoW',
            value: formatCompactNumberIntl(data.ingredients.today),
          },
          {
            icon: HiOutlineCube,
            label: 'Last 7 Days',
            value: formatCompactNumberIntl(data.ingredients.last7d),
          },
          {
            icon: HiOutlineCube,
            label: 'Last 30 Days',
            value: formatCompactNumberIntl(data.ingredients.last30d),
          },
        ]}
        gridCols={{ desktop: 3, mobile: 1, tablet: 3 }}
        isLoading={isLoading}
      />

      {/* Category Breakdown */}
      {data.ingredients.categoryBreakdown.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            Ingredient Category Breakdown
          </h3>
          <div className="flex flex-wrap gap-3">
            {data.ingredients.categoryBreakdown.map((item) => (
              <div
                key={item.category}
                className="flex items-center gap-2 rounded bg-muted px-3 py-2"
              >
                <HiOutlinePhoto className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium capitalize text-foreground">
                  {item.category.toLowerCase()}
                </span>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {formatCompactNumberIntl(item.count)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Daily Series Charts */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <DailySeriesChart
          title="Daily Revenue (30d)"
          data={data.revenue.dailySeries}
          valueKey="amount"
          formatter={formatCurrency}
        />
        <DailySeriesChart
          title="Daily Ingredients (30d)"
          data={data.ingredients.dailySeries}
          valueKey="count"
          formatter={(v) => formatCompactNumberIntl(v)}
        />
      </div>

      {/* Comparison Cards */}
      <div>
        <h2 className="mb-4 text-xl font-semibold tracking-[-0.02em] text-foreground">
          Comparisons
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <ComparisonCard
            title="Cash In vs Usage Value"
            leftLabel="Cash In"
            leftValue={formatCurrency(
              data.comparisons.cashInVsUsageValue.cashIn,
            )}
            rightLabel="Usage Value"
            rightValue={formatCurrency(
              data.comparisons.cashInVsUsageValue.usageValue,
            )}
          />
          <ComparisonCard
            title="Credits Sold vs Consumed"
            leftLabel="Sold"
            leftValue={formatCompactNumberIntl(
              data.comparisons.soldVsConsumed.sold,
            )}
            rightLabel="Consumed"
            rightValue={formatCompactNumberIntl(
              data.comparisons.soldVsConsumed.consumed,
            )}
          />
          <ComparisonCard
            title="Outstanding Prepaid"
            leftLabel="Prepaid Balance"
            leftValue={formatCurrency(data.comparisons.outstandingPrepaid)}
            rightLabel=""
            rightValue=""
            difference="Credits sold but not yet consumed"
          />
        </div>
      </div>

      {/* Projections */}
      <div>
        <h2 className="mb-4 text-xl font-semibold tracking-[-0.02em] text-foreground">
          Projections
        </h2>
        <ProjectionCard projections={data.projections} />
      </div>

      {/* Leader Tables */}
      <div>
        <h2 className="mb-4 text-xl font-semibold tracking-[-0.02em] text-foreground">
          Top Organizations
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <LeaderTable
            title="By Revenue"
            leaders={data.leaders.byRevenue}
            valueFormatter={(item) => formatCurrency(item.amount ?? 0)}
            valueLabel="Revenue"
          />
          <LeaderTable
            title="By Credits Consumed"
            leaders={data.leaders.byCredits}
            valueFormatter={(item) => formatCompactNumberIntl(item.amount ?? 0)}
            valueLabel="Credits"
          />
          <LeaderTable
            title="By Ingredients"
            leaders={data.leaders.byIngredients}
            valueFormatter={(item) => formatCompactNumberIntl(item.count ?? 0)}
            valueLabel="Count"
          />
        </div>
      </div>
    </div>
  );
}
