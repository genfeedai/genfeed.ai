'use client';

import { formatFullNumber } from '@genfeedai/helpers/formatting/format/format.helper';
import type { PlatformBreakdownChartProps } from '@genfeedai/props/analytics/analytics.props';
import Card from '@ui/card/Card';
import { ChartContainer, ChartTooltipContent } from '@ui/charts';
import { Cell, Pie, PieChart, Tooltip } from 'recharts';

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

export function PlatformBreakdownChart({
  data,
  title = 'Platform Distribution',
  isLoading = false,
  height = 300,
  className = '',
}: PlatformBreakdownChartProps) {
  const isEmpty = !data || data.length === 0;

  // Filter out platforms with zero values
  const filteredData = data.filter((item) => item.value > 0);

  const getColor = (platform: string) => {
    return (
      PLATFORM_COLORS[platform.toLowerCase()] || 'hsl(var(--muted-foreground))'
    );
  };

  const getLabel = (platform: string) => {
    return PLATFORM_LABELS[platform.toLowerCase()] || platform;
  };

  // Custom label renderer with percentage
  const renderLabel = (entry: any) => {
    const percentage = ((entry.value / entry.payload.total) * 100).toFixed(1);
    return `${percentage}%`;
  };

  // Add total to each data point for percentage calculation
  const total = filteredData.reduce((sum, item) => sum + item.value, 0);
  const dataWithTotal = filteredData.map((item) => ({ ...item, total }));

  return (
    <Card className={className}>
      <div className="p-6">
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
        {/* Chart */}
        <div className="relative" style={{ height }}>
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-card/50 z-10">
              <span className="animate-pulse w-12 h-12 rounded-full bg-primary/30" />
            </div>
          )}

          {isEmpty && !isLoading && (
            <div className="absolute inset-0 flex items-center justify-center text-foreground/50">
              No platform data available
            </div>
          )}

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
                {dataWithTotal.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getColor(entry.platform)} />
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
        </div>
      </div>
    </Card>
  );
}
