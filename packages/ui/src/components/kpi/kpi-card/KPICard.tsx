'use client';

import { CardVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useAnimatedCounter } from '@hooks/ui/use-animated-counter/use-animated-counter';
import type { KPICardProps } from '@props/ui/kpi/kpi-card.props';
import Card from '@ui/card/Card';
import {
  HiOutlineArrowTrendingDown,
  HiOutlineArrowTrendingUp,
} from 'react-icons/hi2';

interface AnimatedValueProps {
  value: string;
}

function AnimatedValue({ value }: AnimatedValueProps) {
  // Extract numeric part and suffix (e.g., "1.2K" -> 1.2, "K")
  const match = value.match(/^([\d.]+)(.*)$/);
  if (!match) {
    return <>{value}</>;
  }

  const numericValue = parseFloat(match[1]);
  const suffix = match[2] || '';
  // Determine decimal places from the original value
  const decimalMatch = match[1].match(/\.(\d+)/);
  const decimals = decimalMatch ? decimalMatch[1].length : 0;

  const { ref, value: animatedValue } = useAnimatedCounter({
    decimals,
    duration: 800,
    end: numericValue,
    suffix,
  });

  return <span ref={ref}>{animatedValue}</span>;
}

export default function KPICard({
  label,
  value,
  icon: Icon,
  iconClassName,
  valueClassName,
  trend,
  trendLabel,
  className,
  variant = CardVariant.DEFAULT,
  isLoading = false,
}: KPICardProps): React.ReactElement {
  const hasTrend = trend !== undefined && trend !== 0;
  const isPositiveTrend = trend !== undefined && trend > 0;
  const TrendIcon = isPositiveTrend
    ? HiOutlineArrowTrendingUp
    : HiOutlineArrowTrendingDown;

  const renderValue = () => {
    if (isLoading) {
      return <div className="h-12 w-20 bg-white/10 animate-pulse" />;
    }

    // Animate if value is a string that looks like a formatted number
    if (typeof value === 'string' && /^[\d.]+[KMB]?$/.test(value)) {
      return <AnimatedValue value={value} />;
    }

    return value;
  };

  return (
    <Card
      variant={variant}
      bodyClassName="p-6 flex flex-col justify-between h-full min-h-card"
      className={cn(className)}
    >
      {/* Top row: Icon (left) + Trend badge (right) */}
      <div className="flex items-start justify-between">
        {Icon && (
          <div
            className={cn(
              'w-10 h-10 rounded-lg bg-white/5 text-foreground/60 flex items-center justify-center',
              iconClassName,
            )}
          >
            <Icon className="w-5 h-5" />
          </div>
        )}

        {hasTrend && !isLoading && (
          <span
            className={cn(
              'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium',
              isPositiveTrend
                ? 'bg-green-500/20 text-green-400'
                : 'bg-red-500/20 text-red-400',
            )}
          >
            <TrendIcon className="w-3 h-3" />
            {Math.abs(trend)}%
            {trendLabel && <span className="ml-0.5">{trendLabel}</span>}
          </span>
        )}
      </div>

      {/* Bottom: Label + Value */}
      <div className="mt-auto">
        <div className="text-[10px] text-foreground/40 uppercase tracking-widest font-bold mb-1">
          {label}
        </div>
        <div
          className={cn('text-5xl font-serif text-foreground', valueClassName)}
        >
          {renderValue()}
        </div>
      </div>
    </Card>
  );
}
