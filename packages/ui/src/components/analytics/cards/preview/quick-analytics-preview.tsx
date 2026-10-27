'use client';

import { CardVariant } from '@genfeedai/contracts';
import type { IAnalytics } from '@genfeedai/contracts/interfaces';
import {
  formatCompactNumberIntl,
  formatPercentage,
} from '@genfeedai/helpers/formatting/format/format.helper';
import { AnalyticsMetricLabel } from '@ui/analytics/metric-definition/AnalyticsMetricInfo';
import Card from '@ui/card/Card';
import { ChartContainer } from '@ui/charts';
import { Skeleton } from '@ui/primitives/skeleton';
import { ArrowRight, ChartNoAxesColumn, Eye, Heart } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';

const AreaChart = dynamic(() => import('recharts').then((m) => m.AreaChart), {
  ssr: false,
});
const Area = dynamic(() => import('recharts').then((m) => m.Area), {
  ssr: false,
});

const TREND_DATA = [
  { value: 72 },
  { value: 85 },
  { value: 63 },
  { value: 91 },
  { value: 78 },
  { value: 54 },
  { value: 88 },
];

export interface QuickAnalyticsPreviewProps {
  data: IAnalytics | null;
  isLoading?: boolean;
  moreLink?: string;
  className?: string;
  title?: string;
}

function getTrendColor(growth: number): string {
  if (growth > 0) {
    return 'text-success';
  }
  if (growth < 0) {
    return 'text-destructive';
  }
  return 'text-muted-foreground';
}

export function QuickAnalyticsPreview({
  data,
  isLoading = false,
  moreLink = '/analytics',
  className = '',
  title = 'Analytics Overview',
}: QuickAnalyticsPreviewProps) {
  if (isLoading) {
    return (
      <Card
        bodyClassName="gap-0 p-6"
        className={className}
        variant={CardVariant.BORDERED}
      >
        <div>
          <Skeleton className="mb-6 h-6 w-1/3" />
          <div className="mb-6 grid grid-cols-3 gap-4">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
          <Skeleton className="mb-4 h-32" />
          <Skeleton className="h-10" />
        </div>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card
        bodyClassName="gap-0 p-6"
        className={className}
        variant={CardVariant.BORDERED}
      >
        <div className="flex items-center gap-2 mb-6">
          <ChartNoAxesColumn className="size-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        </div>
        <div className="text-center py-8">
          <p className="text-muted-foreground mb-4">
            No analytics data available
          </p>
          <Link
            href={moreLink}
            className="inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
          >
            Go to Analytics
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </Card>
    );
  }

  const quickStats = [
    {
      color: 'text-muted-foreground',
      icon: ChartNoAxesColumn,
      analyticsMetric: 'posts' as const,
      label: 'Total Posts',
      value: data.totalPosts,
    },
    {
      color: 'text-muted-foreground',
      growth: data.viewsGrowth,
      icon: Eye,
      analyticsMetric: 'views' as const,
      label: 'Total Views',
      value: data.totalViews,
    },
    {
      color: 'text-muted-foreground',
      growth: data.engagementGrowth,
      icon: Heart,
      analyticsMetric: 'likes' as const,
      label: 'Engagement',
      value: data.totalLikes || 0,
    },
  ];

  return (
    <Card
      bodyClassName="gap-0 p-6"
      className={className}
      variant={CardVariant.BORDERED}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <ChartNoAxesColumn className="size-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        </div>
        <span className="text-sm text-muted-foreground">Last 7 days</span>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {quickStats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg bg-muted p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <stat.icon className={`size-4 ${stat.color}`} />
              <p className="text-xs text-muted-foreground">
                <AnalyticsMetricLabel metric={stat.analyticsMetric}>
                  {stat.label}
                </AnalyticsMetricLabel>
              </p>
            </div>
            <p className="text-2xl font-bold text-foreground mb-1 tabular-nums">
              {formatCompactNumberIntl(stat.value)}
            </p>
            {stat.growth !== undefined && (
              <p
                className={`text-xs font-medium tabular-nums ${getTrendColor(stat.growth)}`}
              >
                {formatPercentage(stat.growth)}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Mini Trend Chart */}
      <div className="mb-6 rounded-lg bg-secondary p-4">
        <p className="text-sm font-medium text-foreground/80 mb-3">
          Views Trend
        </p>
        <ChartContainer
          config={{
            value: {
              color: 'hsl(var(--muted-foreground))',
              label: 'Views',
            },
          }}
          className="border-0 bg-transparent p-0 shadow-none"
          height={80}
        >
          <AreaChart data={TREND_DATA}>
            <defs>
              <linearGradient id="colorPreview" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="hsl(var(--muted-foreground))"
                  stopOpacity={0.3}
                />
                <stop
                  offset="95%"
                  stopColor="hsl(var(--muted-foreground))"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="value"
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorPreview)"
            />
          </AreaChart>
        </ChartContainer>
      </div>

      {/* Platform Distribution */}
      {data.activePlatforms && data.activePlatforms.length > 0 && (
        <div className="mb-6">
          <p className="text-sm font-medium text-foreground/80 mb-3">
            Active Platforms
          </p>
          <div className="flex flex-wrap gap-2">
            {data.activePlatforms.map((platform) => (
              <span
                key={platform}
                className="px-3 py-1 rounded-full text-xs font-medium bg-secondary text-secondary-foreground"
              >
                {platform.charAt(0).toUpperCase() + platform.slice(1)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Best Performing Platform */}
      {data.bestPerformingPlatform && (
        <div className="mb-6 rounded-lg bg-secondary p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">
              Best Performing Platform
            </p>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-primary text-primary-foreground">
              {data.bestPerformingPlatform.charAt(0).toUpperCase() +
                data.bestPerformingPlatform.slice(1)}
            </span>
          </div>
        </div>
      )}

      {/* View More Button */}
      <Link
        href={moreLink}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-foreground px-4 py-3 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
      >
        View Detailed Analytics
        <ArrowRight className="size-4" />
      </Link>
    </Card>
  );
}
