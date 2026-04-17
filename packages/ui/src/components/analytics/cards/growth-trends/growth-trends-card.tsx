'use client';

import { Timeframe, TrendDirection } from '@genfeedai/enums';
import {
  formatCompactNumberIntl,
  formatPercentage,
} from '@genfeedai/helpers/formatting/format/format.helper';
import type { GrowthTrendsCardProps } from '@genfeedai/props/analytics/analytics.props';
import {
  HiArrowTrendingDown,
  HiArrowTrendingUp,
  HiMinus,
} from 'react-icons/hi2';

export function GrowthTrendsCard({
  growthData,
  timeframe = Timeframe.D30,
  isLoading = false,
  className = '',
}: GrowthTrendsCardProps) {
  const cardClassName = `rounded-xl border border-border bg-card p-6 ${className}`;

  if (isLoading) {
    return (
      <div className={cardClassName}>
        <div className="animate-pulse">
          <div className="h-6 bg-muted w-1/3 mb-4" />
          <div className="space-y-4">
            <div className="h-20 bg-muted" />
            <div className="h-20 bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  if (!growthData) {
    return (
      <div className={cardClassName}>
        <h3 className="text-lg font-semibold text-foreground mb-4">
          Growth Trends
        </h3>
        <div className="text-center py-8">
          <p className="text-muted-foreground">No growth data available</p>
        </div>
      </div>
    );
  }

  const getTrendIcon = (direction: TrendDirection) => {
    switch (direction) {
      case TrendDirection.UP:
        return <HiArrowTrendingUp className="w-4 h-4 text-green-500" />;
      case TrendDirection.DOWN:
        return <HiArrowTrendingDown className="w-4 h-4 text-red-500" />;
      default:
        return <HiMinus className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getTrendColor = (direction: TrendDirection) => {
    switch (direction) {
      case TrendDirection.UP:
        return 'text-green-600 dark:text-green-400';
      case TrendDirection.DOWN:
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-muted-foreground';
    }
  };

  const getTimeframeLabel = () => {
    switch (timeframe) {
      case Timeframe.D7:
        return 'Last 7 days';
      case Timeframe.D30:
        return 'Last 30 days';
      case Timeframe.D90:
        return 'Last 90 days';
      default:
        return 'Period';
    }
  };

  return (
    <div className={cardClassName}>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-foreground">Growth Trends</h3>
        <div className="flex items-center gap-2">
          {getTrendIcon(growthData.trendingDirection)}
          <span
            className={`text-sm font-medium ${getTrendColor(growthData.trendingDirection)}`}
          >
            {growthData.trendingDirection === TrendDirection.UP &&
              'Trending Up'}
            {growthData.trendingDirection === TrendDirection.DOWN &&
              'Trending Down'}
            {growthData.trendingDirection === TrendDirection.STABLE && 'Stable'}
          </span>
        </div>
      </div>

      {/* Views Growth */}
      <div className="mb-6 pb-6 border-b border-border">
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Views</p>
            <p className="text-2xl font-bold text-foreground">
              {formatCompactNumberIntl(growthData.views.current)}
            </p>
          </div>
          <div className="text-right">
            <p
              className={`text-lg font-semibold ${growthData.views.growth >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
            >
              {formatPercentage(growthData.views.growthPercentage)}
            </p>
            <p className="text-xs text-muted-foreground">vs previous period</p>
          </div>
        </div>
        <div className="flex items-center gap-4 mt-3">
          <div>
            <p className="text-xs text-muted-foreground">Current</p>
            <p className="text-sm font-medium text-foreground/80">
              {formatCompactNumberIntl(growthData.views.current)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Previous</p>
            <p className="text-sm font-medium text-foreground/80">
              {formatCompactNumberIntl(growthData.views.previous)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Change</p>
            <p
              className={`text-sm font-medium ${growthData.views.growth >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
            >
              {formatCompactNumberIntl(Math.abs(growthData.views.growth))}
            </p>
          </div>
        </div>
      </div>

      {/* Engagement Growth */}
      <div className="mb-6 pb-6 border-b border-border">
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Engagement</p>
            <p className="text-2xl font-bold text-foreground">
              {formatCompactNumberIntl(growthData.engagement.current)}
            </p>
          </div>
          <div className="text-right">
            <p
              className={`text-lg font-semibold ${growthData.engagement.growth >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
            >
              {formatPercentage(growthData.engagement.growthPercentage)}
            </p>
            <p className="text-xs text-muted-foreground">vs previous period</p>
          </div>
        </div>
        <div className="flex items-center gap-4 mt-3">
          <div>
            <p className="text-xs text-muted-foreground">Current</p>
            <p className="text-sm font-medium text-foreground/80">
              {formatCompactNumberIntl(growthData.engagement.current)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Previous</p>
            <p className="text-sm font-medium text-foreground/80">
              {formatCompactNumberIntl(growthData.engagement.previous)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Change</p>
            <p
              className={`text-sm font-medium ${growthData.engagement.growth >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
            >
              {formatCompactNumberIntl(Math.abs(growthData.engagement.growth))}
            </p>
          </div>
        </div>
      </div>

      {/* Best Day */}
      <div className="rounded-lg bg-purple-50 p-4 dark:bg-purple-900/20">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-purple-900 dark:text-purple-100 mb-1">
              Best Performing Day
            </p>
            <p className="text-lg font-bold text-purple-600 dark:text-purple-400">
              {new Date(growthData.bestDay.date).toLocaleDateString('en-US', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-purple-700 dark:text-purple-300 mb-1">
              Views
            </p>
            <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {formatCompactNumberIntl(growthData.bestDay.views)}
            </p>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mt-4">
        Comparing {getTimeframeLabel().toLowerCase()} vs previous period
      </p>
    </div>
  );
}
