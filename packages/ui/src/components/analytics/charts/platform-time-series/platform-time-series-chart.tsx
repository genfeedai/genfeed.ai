'use client';

import { ButtonVariant } from '@genfeedai/enums';
import {
  formatChartDate,
  formatCompactNumberIntl,
} from '@genfeedai/helpers/formatting/format/format.helper';
import type { PlatformTimeSeriesChartProps } from '@genfeedai/props/analytics/charts.props';
import { ChartContainer, ChartTooltipContent } from '@ui/charts';
import { Button } from '@ui/primitives/button';
import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const PLATFORM_COLORS = {
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

const PLATFORM_LABELS = {
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

export function PlatformTimeSeriesChart({
  data,
  platforms = ['instagram', 'tiktok', 'youtube', 'twitter'],
  isLoading = false,
  height = 300,
  className = '',
}: PlatformTimeSeriesChartProps) {
  const [activePlatforms, setActivePlatforms] =
    useState<(keyof typeof PLATFORM_COLORS)[]>(platforms);
  const chartConfig = useMemo(
    () =>
      Object.fromEntries(
        platforms.map((platform) => [
          platform,
          {
            color: PLATFORM_COLORS[platform],
            label: PLATFORM_LABELS[platform],
          },
        ]),
      ),
    [platforms],
  );

  const isEmpty = !data || data.length === 0;

  const togglePlatform = (platform: keyof typeof PLATFORM_COLORS) => {
    if (activePlatforms.includes(platform)) {
      if (activePlatforms.length > 1) {
        setActivePlatforms(activePlatforms.filter((p) => p !== platform));
      }
    } else {
      setActivePlatforms([...activePlatforms, platform]);
    }
  };

  return (
    <div className={className}>
      {/* Platform Toggles */}
      <div className="flex flex-wrap gap-2 mb-4">
        {platforms.map((platform) => (
          <Button
            type="button"
            key={platform}
            onClick={() => togglePlatform(platform)}
            isDisabled={isLoading || isEmpty}
            variant={ButtonVariant.UNSTYLED}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
              activePlatforms.includes(platform)
                ? 'bg-white/10 border-white/20 text-white'
                : 'bg-transparent border-white/[0.08] text-white/50 hover:border-white/20 hover:text-white/80'
            } ${isLoading || isEmpty ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span
              className="inline-block w-3 h-3 rounded-full mr-2"
              style={{ backgroundColor: PLATFORM_COLORS[platform] }}
            />
            {PLATFORM_LABELS[platform]}
          </Button>
        ))}
      </div>

      {/* Chart */}
      <div className="relative" style={{ height }}>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-card/50 z-10">
            <span className="animate-pulse w-12 h-12 rounded-full bg-primary/30" />
          </div>
        )}

        {isEmpty && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center text-foreground/50">
            No data available
          </div>
        )}

        {!isEmpty && (
          <ChartContainer
            config={chartConfig}
            className="border-white/[0.08] bg-card p-3 shadow-[0_24px_60px_-40px_rgba(0,0,0,0.8)]"
            height="100%"
            style={{ minWidth: 0 }}
          >
            <AreaChart
              data={data}
              margin={{ bottom: 0, left: 0, right: 30, top: 10 }}
            >
              <defs>
                {activePlatforms.map((platform) => (
                  <linearGradient
                    key={platform}
                    id={`color${platform}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor={PLATFORM_COLORS[platform]}
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor={PLATFORM_COLORS[platform]}
                      stopOpacity={0}
                    />
                  </linearGradient>
                ))}
              </defs>

              <CartesianGrid
                strokeDasharray="0"
                stroke="var(--overlay-white-5)"
                vertical={false}
              />

              <XAxis
                dataKey="date"
                tickFormatter={formatChartDate}
                stroke="var(--overlay-white-20)"
                tick={{ fill: 'var(--overlay-white-20)' }}
                style={{ fontSize: '12px' }}
              />

              <YAxis
                stroke="var(--overlay-white-20)"
                tick={{ fill: 'var(--overlay-white-20)' }}
                style={{ fontSize: '12px' }}
              />

              <Tooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(label) =>
                      `Date: ${formatChartDate(
                        typeof label === 'string' ||
                          typeof label === 'number' ||
                          label instanceof Date
                          ? label
                          : null,
                      )}`
                    }
                    valueFormatter={(value) =>
                      formatCompactNumberIntl(
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

              {activePlatforms.map((platform) => (
                <Area
                  key={platform}
                  type="monotone"
                  dataKey={platform}
                  stroke={PLATFORM_COLORS[platform]}
                  strokeWidth={2}
                  fillOpacity={1}
                  fill={`url(#color${platform})`}
                />
              ))}
            </AreaChart>
          </ChartContainer>
        )}
      </div>
    </div>
  );
}
