'use client';

import { AnalyticsMetric, ButtonVariant } from '@genfeedai/contracts';
import {
  formatCompactNumberIntl,
  formatFullNumber,
} from '@genfeedai/helpers/formatting/format/format.helper';
import type { BrandPerformanceChartProps } from '@genfeedai/props/analytics/charts.props';
import Card from '@ui/card/Card';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import { ChartContainer, ChartTooltipContent } from '@ui/charts';
import { Button } from '@ui/primitives/button';
import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';

const BarChart = dynamic(() => import('recharts').then((m) => m.BarChart), {
  ssr: false,
});
const Bar = dynamic(() => import('recharts').then((m) => m.Bar), {
  ssr: false,
});
const CartesianGrid = dynamic(
  () => import('recharts').then((m) => m.CartesianGrid),
  { ssr: false },
);
const Tooltip = dynamic(() => import('recharts').then((m) => m.Tooltip), {
  ssr: false,
});
const XAxis = dynamic(() => import('recharts').then((m) => m.XAxis), {
  ssr: false,
});
const YAxis = dynamic(() => import('recharts').then((m) => m.YAxis), {
  ssr: false,
});

const METRIC_COLORS = {
  engagement: 'var(--accent-rose)',
  posts: 'var(--overlay-white-20)',
  views: 'hsl(var(--foreground))',
};

const METRIC_LABELS = {
  engagement: 'Engagement',
  posts: 'Posts',
  views: 'Views',
};

type BrandMetricKey = keyof typeof METRIC_COLORS;

function formatBrandName(name: string): string {
  return name.length > 15 ? `${name.substring(0, 15)}…` : name;
}

export function BrandPerformanceChart({
  data,
  title = 'Top Brands Performance',
  metric = AnalyticsMetric.ENGAGEMENT,
  isLoading = false,
  height = 300,
  className = '',
}: BrandPerformanceChartProps) {
  const [activeMetric, setActiveMetric] = useState<BrandMetricKey>(
    String(metric).toLowerCase() as BrandMetricKey,
  );
  const chartConfig = useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(METRIC_LABELS) as BrandMetricKey[]).map((metricKey) => [
          metricKey,
          {
            color: METRIC_COLORS[metricKey],
            label: METRIC_LABELS[metricKey],
          },
        ]),
      ),
    [],
  );

  // Brands with only zeros still "exist" in the API — treat no signal as empty
  // so we don't show a blank chart frame with metric toggles and no story.
  const hasSignal = Boolean(
    data?.some((row) => row.engagement > 0 || row.posts > 0 || row.views > 0),
  );
  const isEmpty = !data || data.length === 0 || !hasSignal;

  // Sort and take top 10 brands by selected metric
  const sortedData = isEmpty
    ? []
    : data.toSorted((a, b) => b[activeMetric] - a[activeMetric]).slice(0, 10);

  return (
    <Card className={className} label={title} bodyClassName="gap-3 p-4">
      {!isEmpty ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {(Object.keys(METRIC_LABELS) as BrandMetricKey[]).map((metricKey) => (
            <Button
              type="button"
              key={metricKey}
              onClick={() => setActiveMetric(metricKey)}
              isDisabled={isLoading}
              variant={ButtonVariant.UNSTYLED}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-all ${
                activeMetric === metricKey
                  ? 'border-border-strong bg-muted text-foreground'
                  : 'border-border/60 bg-transparent text-muted-foreground hover:border-border-strong hover:text-foreground'
              } ${isLoading ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <span
                className="mr-2 inline-block size-3 rounded-full"
                style={{ backgroundColor: METRIC_COLORS[metricKey] }}
              />

              {METRIC_LABELS[metricKey]}
            </Button>
          ))}
        </div>
      ) : null}

      {/* Chart */}
      <div className="relative" style={{ height }}>
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/50">
            <span className="size-12 animate-pulse rounded-full bg-primary/30" />
          </div>
        )}

        {isEmpty && !isLoading ? (
          <CardEmptyContent
            className="absolute inset-0 py-0"
            label="No brand performance yet"
            description="Publish posts from a brand to see engagement, posts, and views ranked here."
          />
        ) : null}

        {!isEmpty ? (
          <ChartContainer
            config={chartConfig}
            className="border-0 bg-transparent p-0 shadow-none"
            height="100%"
            style={{ minWidth: 0 }}
          >
            <BarChart
              data={sortedData}
              margin={{ bottom: 60, left: 20, right: 30, top: 5 }}
            >
              <CartesianGrid
                strokeDasharray="0"
                stroke="var(--overlay-white-5)"
                vertical={false}
              />
              <XAxis
                dataKey="name"
                angle={-45}
                textAnchor="end"
                height={80}
                tick={{ fill: 'var(--overlay-white-20)', fontSize: 12 }}
                tickFormatter={formatBrandName}
                stroke="var(--overlay-white-20)"
              />
              <YAxis
                tick={{ fill: 'var(--overlay-white-20)', fontSize: 12 }}
                tickFormatter={formatCompactNumberIntl}
                stroke="var(--overlay-white-20)"
              />
              <Tooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(label) => String(label)}
                    valueFormatter={(value) =>
                      formatFullNumber(
                        typeof value === 'number'
                          ? value
                          : typeof value === 'string'
                            ? Number(value)
                            : undefined,
                      )
                    }
                  />
                }
              />
              <Bar
                dataKey={activeMetric as 'engagement' | 'posts' | 'views'}
                fill={METRIC_COLORS[activeMetric]}
                radius={[8, 8, 0, 0]}
                maxBarSize={60}
              />
            </BarChart>
          </ChartContainer>
        ) : null}
      </div>
    </Card>
  );
}
