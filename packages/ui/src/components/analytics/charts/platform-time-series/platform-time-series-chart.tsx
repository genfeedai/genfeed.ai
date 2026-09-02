'use client';

import {
  ButtonVariant,
  formatPlatformLabel,
  Platform,
} from '@genfeedai/contracts';
import {
  formatChartDate,
  formatCompactNumberIntl,
} from '@genfeedai/helpers/formatting/format/format.helper';
import type { PlatformTimeSeriesChartProps } from '@genfeedai/props/analytics/charts.props';
import { ChartContainer, ChartTooltipContent } from '@ui/charts';
import { Button } from '@ui/primitives/button';
import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';

const AreaChart = dynamic(() => import('recharts').then((m) => m.AreaChart), {
  ssr: false,
});
const Area = dynamic(() => import('recharts').then((m) => m.Area), {
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

const PLATFORM_COLORS: Partial<Record<Platform, string>> = {
  [Platform.FACEBOOK]: 'var(--platform-facebook)',
  [Platform.INSTAGRAM]: 'var(--platform-instagram)',
  [Platform.LINKEDIN]: 'var(--platform-linkedin)',
  [Platform.MEDIUM]: 'hsl(var(--foreground))',
  [Platform.PINTEREST]: 'var(--platform-pinterest)',
  [Platform.REDDIT]: 'var(--platform-reddit)',
  [Platform.TIKTOK]: 'var(--platform-tiktok)',
  [Platform.TWITTER]: 'var(--platform-twitter)',
  [Platform.YOUTUBE]: 'hsl(var(--destructive))',
};

function chartPlatformColor(platform: Platform): string {
  return PLATFORM_COLORS[platform] ?? 'hsl(var(--foreground))';
}

function chartPlatformLabel(platform: Platform): string {
  return formatPlatformLabel(platform) ?? platform;
}

interface PlatformSelectionOverride {
  sourcePlatforms: Platform[];
  inactivePlatforms: Platform[];
}

function arePlatformsEqual(left: Platform[], right: Platform[]) {
  return (
    left.length === right.length &&
    left.every((platform, index) => platform === right[index])
  );
}

export function PlatformTimeSeriesChart({
  data,
  platforms = [
    Platform.INSTAGRAM,
    Platform.TIKTOK,
    Platform.YOUTUBE,
    Platform.TWITTER,
  ],
  isLoading = false,
  height = 300,
  className = '',
}: PlatformTimeSeriesChartProps) {
  const [selectionOverride, setSelectionOverride] =
    useState<PlatformSelectionOverride | null>(null);
  const activeSelectionOverride =
    selectionOverride &&
    arePlatformsEqual(selectionOverride.sourcePlatforms, platforms)
      ? selectionOverride
      : null;
  const inactivePlatforms = activeSelectionOverride?.inactivePlatforms ?? [];
  const availableActivePlatforms = platforms.filter(
    (platform) => !inactivePlatforms.includes(platform),
  );
  const activePlatforms =
    availableActivePlatforms.length > 0
      ? availableActivePlatforms
      : platforms.slice(0, 1);
  const chartConfig = useMemo(
    () =>
      Object.fromEntries(
        platforms.map((platform) => [
          platform,
          {
            color: chartPlatformColor(platform),
            label: chartPlatformLabel(platform),
          },
        ]),
      ),
    [platforms],
  );

  const isEmpty = !data || data.length === 0;

  const togglePlatform = (platform: Platform) => {
    const nextInactivePlatforms = inactivePlatforms.includes(platform)
      ? inactivePlatforms.filter(
          (inactivePlatform) => inactivePlatform !== platform,
        )
      : activePlatforms.length > 1
        ? [...inactivePlatforms, platform]
        : inactivePlatforms;

    setSelectionOverride({
      sourcePlatforms: [...platforms],
      inactivePlatforms: nextInactivePlatforms,
    });
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
                ? 'border-border-strong bg-muted text-foreground'
                : 'border-border/60 bg-transparent text-muted-foreground hover:border-border-strong hover:text-foreground'
            } ${isLoading || isEmpty ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span
              className="inline-block size-3 rounded-full mr-2"
              style={{ backgroundColor: chartPlatformColor(platform) }}
            />
            {chartPlatformLabel(platform)}
          </Button>
        ))}
      </div>

      {/* Chart */}
      <div className="relative" style={{ height }}>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-card/50 z-10">
            <span className="animate-pulse size-12 rounded-full bg-primary/30" />
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
            className="bg-card shadow-border p-3"
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
                      stopColor={chartPlatformColor(platform)}
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor={chartPlatformColor(platform)}
                      stopOpacity={0}
                    />
                  </linearGradient>
                ))}
              </defs>

              <CartesianGrid
                strokeDasharray="0"
                stroke="hsl(var(--border))"
                vertical={false}
              />

              <XAxis
                dataKey="date"
                tickFormatter={formatChartDate}
                stroke="hsl(var(--border))"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                style={{ fontSize: '12px' }}
              />

              <YAxis
                stroke="hsl(var(--border))"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
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
                  stroke={chartPlatformColor(platform)}
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
