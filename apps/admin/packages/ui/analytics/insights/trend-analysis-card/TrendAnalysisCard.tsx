'use client';

import { TrendDirection } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import {
  formatCompactNumberIntl,
  formatPercentage,
} from '@helpers/formatting/format/format.helper';
import type { TrendAnalysisCardProps } from '@props/analytics/insights.props';
import Card from '@ui/card/Card';
import { memo, useMemo } from 'react';
import {
  HiArrowTrendingDown,
  HiArrowTrendingUp,
  HiChartBar,
  HiMinus,
} from 'react-icons/hi2';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const getDirectionStyles = (direction: TrendDirection) => {
  switch (direction) {
    case TrendDirection.UP:
      return {
        bg: 'bg-success/10',
        gradient: ['#10b981', '#10b98100'],
        stroke: '#10b981',
        text: 'text-success',
      };
    case TrendDirection.DOWN:
      return {
        bg: 'bg-error/10',
        gradient: ['#ef4444', '#ef444400'],
        stroke: '#ef4444',
        text: 'text-error',
      };
    default:
      return {
        bg: 'bg-background',
        gradient: ['#6b7280', '#6b728000'],
        stroke: '#6b7280',
        text: 'text-foreground/70',
      };
  }
};

const TrendAnalysisCard = memo(function TrendAnalysisCard({
  trends,
  isLoading = false,
  className,
}: TrendAnalysisCardProps) {
  if (isLoading) {
    return (
      <Card
        label="Trend Analysis"
        icon={HiChartBar}
        iconClassName="text-primary"
        className={className}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse p-4 bg-background">
              <div className="flex items-center justify-between mb-3">
                <div className="h-4 bg-muted w-24" />
                <div className="h-6 bg-muted w-16" />
              </div>
              <div className="h-20 bg-muted" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (trends.length === 0) {
    return (
      <Card
        label="Trend Analysis"
        icon={HiChartBar}
        iconClassName="text-primary"
        className={className}
      >
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <HiChartBar className="w-12 h-12 text-foreground/30 mb-3" />
          <p className="text-foreground/70 font-medium">
            No trend data available
          </p>
          <p className="text-sm text-foreground/50">
            Trends will appear once you have enough data
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card
      label="Trend Analysis"
      icon={HiChartBar}
      iconClassName="text-primary"
      description="Performance trends and forecasts"
      className={className}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {trends.map((trend) => (
          <TrendItem key={trend.id} trend={trend} />
        ))}
      </div>
    </Card>
  );
});

interface TrendItemProps {
  trend: TrendAnalysisCardProps['trends'][0];
}

const TrendItem = memo(function TrendItem({ trend }: TrendItemProps) {
  const styles = getDirectionStyles(trend.direction);

  const chartData = useMemo(() => {
    return trend.forecast.map((value, index) => ({
      index: index + 1,
      value,
    }));
  }, [trend.forecast]);

  const DirectionIcon =
    trend.direction === TrendDirection.UP
      ? HiArrowTrendingUp
      : trend.direction === TrendDirection.DOWN
        ? HiArrowTrendingDown
        : HiMinus;

  return (
    <div className="p-4 bg-background hover:bg-background/80 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold capitalize">{trend.metric}</span>
          {trend.platform && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-foreground/70">
              {trend.platform}
            </span>
          )}
        </div>
        <div className={cn('flex items-center gap-1', styles.text)}>
          <DirectionIcon className="w-5 h-5" />
          <span className="font-mono font-medium">
            {formatPercentage(trend.changePercent)}
          </span>
        </div>
      </div>

      <div className="h-20 -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient
                id={`gradient-${trend.id}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="5%" stopColor={styles.gradient[0]} />
                <stop offset="95%" stopColor={styles.gradient[1]} />
              </linearGradient>
            </defs>
            <XAxis dataKey="index" hide />
            <YAxis hide domain={['auto', 'auto']} />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload?.length) {
                  return (
                    <div className="bg-card border border-white/[0.08] px-3 py-2 shadow-lg">
                      <p className="text-sm font-medium">
                        {formatCompactNumberIntl(payload[0].value as number)}
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={styles.stroke}
              strokeWidth={2}
              fill={`url(#gradient-${trend.id})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-between mt-2 text-xs text-foreground/50">
        <span>{trend.period}</span>
        <span>
          Confidence:{' '}
          <span className="font-medium">{Math.round(trend.confidence)}%</span>
        </span>
      </div>
    </div>
  );
});

export default TrendAnalysisCard;
