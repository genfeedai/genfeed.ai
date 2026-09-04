'use client';

import { formatFullNumber } from '@genfeedai/helpers/formatting/format/format.helper';
import type { PlatformBreakdownChartProps } from '@genfeedai/props/analytics/analytics.props';
import Card from '@ui/card/Card';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import { ChartContainer, ChartTooltipContent } from '@ui/charts';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import dynamic from 'next/dynamic';
import type { PieLabelRenderProps } from 'recharts';

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

const PLATFORM_COLORS: Record<string, string> = {
  facebook: 'var(--platform-facebook)',
  instagram: 'var(--platform-instagram)',
  linkedin: 'var(--platform-linkedin)',
  medium: 'hsl(var(--foreground))',
  pinterest: 'var(--platform-pinterest)',
  reddit: 'var(--platform-reddit)',
  tiktok: 'var(--platform-tiktok)',
  twitter: 'var(--platform-twitter)',
  youtube: 'hsl(var(--destructive))',
};

const PLATFORM_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  medium: 'Medium',
  pinterest: 'Pinterest',
  reddit: 'Reddit',
  tiktok: 'TikTok',
  twitter: 'Twitter',
  youtube: 'YouTube',
};

type PlatformBreakdownLabelEntry = {
  payload?: { total?: number };
  value: number;
};

function getColor(platform: string): string {
  return (
    PLATFORM_COLORS[platform.toLowerCase()] || 'hsl(var(--muted-foreground))'
  );
}

function getLabel(platform: string): string {
  return PLATFORM_LABELS[platform.toLowerCase()] || platform;
}

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
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/50">
              <span className="size-12 animate-pulse rounded-full bg-primary/30" />
            </div>
          )}

          {isEmpty && !isLoading ? (
            <CardEmptyContent
              className="absolute inset-0 py-0"
              label="No platform distribution yet"
              description="Connect channels and publish content to see how views split across platforms."
            />
          ) : null}

          {!isEmpty ? (
            <ChartContainer
              config={Object.fromEntries(
                dataWithTotal.map((item) => [
                  item.platform,
                  {
                    color: getColor(item.platform),
                    label: getLabel(item.platform),
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
                      fill={getColor(entry.platform)}
                    />
                  ))}
                </Pie>

                <Tooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_label, payload) =>
                        getLabel(String(payload?.[0]?.payload?.platform ?? ''))
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
