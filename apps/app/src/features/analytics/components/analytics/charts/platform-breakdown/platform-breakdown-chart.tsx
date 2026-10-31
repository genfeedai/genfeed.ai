'use client';

import { formatFullNumber } from '@genfeedai/helpers/formatting/format/format.helper';
import Card from '@ui/card/Card';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import { ChartContainer, ChartTooltipContent } from '@ui/charts';
import dynamic from 'next/dynamic';
import type { PieLabelRenderProps } from 'recharts';
import { WorkspaceSurface } from '@/components/overview/WorkspaceSurface';
import {
  ChartLoadingOverlay,
  chartPlatformColor,
  chartPlatformLabel,
} from '@/features/analytics/components/analytics/charts/chart-theme';
import type { PlatformBreakdownChartProps } from '@/features/analytics/props/analytics.props';

const PieChart = dynamic(() => import('recharts').then((m) => m.PieChart), {
  ssr: false,
});
const Pie = dynamic(() => import('recharts').then((m) => m.Pie), {
  ssr: false,
});
const Cell = dynamic(() => import('recharts').then((m) => m.Cell), {
  ssr: false,
});
const Tooltip = dynamic(() => import('recharts').then((m) => m.Tooltip), {
  ssr: false,
});

type PlatformBreakdownLabelEntry = {
  payload?: { total?: number };
  value: number;
};

function renderLabel(entry: PieLabelRenderProps): string {
  const { payload, value } = entry as PlatformBreakdownLabelEntry;
  const total = payload?.total ?? 0;
  const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
  return `${percentage}%`;
}

export function PlatformBreakdownChart({
  data,
  title = 'Platform Distribution',
  isLoading = false,
  height = 300,
  className = '',
}: PlatformBreakdownChartProps) {
  const chartData = data ?? [];
  // Zero-value platforms are noise — empty when nothing has signal.
  const filteredData = chartData.filter((item) => item.value > 0);
  const isEmpty = filteredData.length === 0;

  // Add total to each data point for percentage calculation
  const total = filteredData.reduce((sum, item) => sum + item.value, 0);
  const dataWithTotal = filteredData.map((item) => ({ ...item, total }));

  return (
    <WorkspaceSurface density="compact" framed={false} title={title}>
      <Card className={className} bodyClassName="gap-3 p-4">
        <div className="relative" style={{ height }}>
          {isLoading && <ChartLoadingOverlay />}

          {isEmpty && !isLoading ? (
            <CardEmptyContent
              className="absolute inset-0 py-0"
              label="No platform distribution yet"
            />
          ) : null}

          {!isEmpty ? (
            <ChartContainer
              config={Object.fromEntries(
                dataWithTotal.map((item) => [
                  item.platform,
                  {
                    color: chartPlatformColor(item.platform),
                    label: chartPlatformLabel(item.platform),
                  },
                ]),
              )}
              className="border-0 bg-transparent p-0 shadow-none"
              height="100%"
              style={{ minWidth: 0 }}
            >
              <PieChart>
                <Pie
                  data={dataWithTotal}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderLabel}
                  outerRadius={80}
                  fill="hsl(var(--muted-foreground))"
                  dataKey="value"
                >
                  {dataWithTotal.map((entry) => (
                    <Cell
                      key={entry.platform}
                      fill={chartPlatformColor(entry.platform)}
                    />
                  ))}
                </Pie>

                <Tooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_label, payload) =>
                        chartPlatformLabel(
                          String(payload?.[0]?.payload?.platform ?? ''),
                        )
                      }
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
              </PieChart>
            </ChartContainer>
          ) : null}
        </div>
      </Card>
    </WorkspaceSurface>
  );
}
