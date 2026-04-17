'use client';

import {
  formatCompactNumberIntl,
  formatPercentage,
} from '@genfeedai/helpers/formatting/format/format.helper';
import type { IAnalytics } from '@genfeedai/interfaces';
import Link from 'next/link';
import {
  HiArrowRight,
  HiChartBarSquare,
  HiEye,
  HiHeart,
} from 'react-icons/hi2';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';

export interface QuickAnalyticsPreviewProps {
  data: IAnalytics | null;
  isLoading?: boolean;
  moreLink?: string;
  className?: string;
  title?: string;
}

export function QuickAnalyticsPreview({
  data,
  isLoading = false,
  moreLink = '/analytics',
  className = '',
  title = 'Analytics Overview',
}: QuickAnalyticsPreviewProps) {
  const cardClassName = `rounded-xl border border-border bg-card p-6 ${className}`;

  if (isLoading) {
    return (
      <div className={cardClassName}>
        <div className="animate-pulse">
          <div className="h-6 bg-muted w-1/3 mb-6" />
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="h-20 bg-muted" />
            <div className="h-20 bg-muted" />
            <div className="h-20 bg-muted" />
          </div>
          <div className="h-32 bg-muted mb-4" />
          <div className="h-10 bg-muted" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={cardClassName}>
        <div className="flex items-center gap-2 mb-6">
          <HiChartBarSquare className="w-4 h-4 text-purple-600" />
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        </div>
        <div className="text-center py-8">
          <p className="text-muted-foreground mb-4">
            No analytics data available
          </p>
          <Link
            href={moreLink}
            className="inline-flex items-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
          >
            Go to Analytics
            <HiArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  const getTrendColor = (growth: number) => {
    if (growth > 0) {
      return 'text-green-600 dark:text-green-400';
    }
    if (growth < 0) {
      return 'text-red-600 dark:text-red-400';
    }
    return 'text-muted-foreground';
  };

  // Generate simple trend data for mini chart
  const trendData = [
    { value: 72 },
    { value: 85 },
    { value: 63 },
    { value: 91 },
    { value: 78 },
    { value: 54 },
    { value: 88 },
  ];

  const quickStats = [
    {
      color: 'text-purple-600',
      icon: HiChartBarSquare,
      label: 'Total Posts',
      value: data.totalPosts,
    },
    {
      color: 'text-blue-600',
      growth: data.viewsGrowth,
      icon: HiEye,
      label: 'Total Views',
      value: data.totalViews,
    },
    {
      color: 'text-pink-600',
      growth: data.engagementGrowth,
      icon: HiHeart,
      label: 'Engagement',
      value: data.totalLikes || 0,
    },
  ];

  return (
    <div className={cardClassName}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <HiChartBarSquare className="w-4 h-4 text-purple-600" />
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        </div>
        <span className="text-sm text-muted-foreground">Last 7 days</span>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {quickStats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-border bg-muted p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
            <p className="text-2xl font-bold text-foreground mb-1">
              {formatCompactNumberIntl(stat.value)}
            </p>
            {stat.growth !== undefined && (
              <p
                className={`text-xs font-medium ${getTrendColor(stat.growth)}`}
              >
                {formatPercentage(stat.growth)}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Mini Trend Chart */}
      <div className="mb-6 rounded-lg border border-purple-100 bg-gradient-to-br from-purple-50 to-blue-50 p-4 dark:border-purple-900/50 dark:from-purple-900/20 dark:to-blue-900/20">
        <p className="text-sm font-medium text-foreground/80 mb-3">
          Views Trend
        </p>
        <ResponsiveContainer width="100%" height={80}>
          <AreaChart data={trendData}>
            <defs>
              <linearGradient id="colorPreview" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="value"
              stroke="#8b5cf6"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorPreview)"
            />
          </AreaChart>
        </ResponsiveContainer>
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
                className="px-3 py-1 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
              >
                {platform.charAt(0).toUpperCase() + platform.slice(1)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Best Performing Platform */}
      {data.bestPerformingPlatform && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-900/50 dark:bg-green-900/20">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-green-900 dark:text-green-100">
              Best Performing Platform
            </p>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-200 dark:bg-green-900/50 text-green-800 dark:text-green-200">
              {data.bestPerformingPlatform.charAt(0).toUpperCase() +
                data.bestPerformingPlatform.slice(1)}
            </span>
          </div>
        </div>
      )}

      {/* View More Button */}
      <Link
        href={moreLink}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-purple-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-purple-700"
      >
        View Detailed Analytics
        <HiArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}
