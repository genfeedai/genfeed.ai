'use client';

import { CardGap, CardPadding, CardVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { keyListItems } from '@genfeedai/helpers/ui/list/key-list-items';
import { useAnimatedCounter } from '@genfeedai/hooks/ui/use-animated-counter/use-animated-counter';
import type {
  MetricCardAppearance,
  MetricCardProps,
  MetricCardSize,
  MetricCardTone,
  MetricSummaryItem,
  MetricSummaryProps,
} from '@genfeedai/props/cards/metric-card.props';
import { AnalyticsMetricLabel } from '@ui/analytics/metric-definition/AnalyticsMetricInfo';
import Card from '@ui/card/Card';
import { Skeleton } from '@ui/primitives/skeleton';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { memo, type ReactElement, type ReactNode } from 'react';

const BODY_PADDING: Record<MetricCardSize, CardPadding> = {
  lg: CardPadding.LG,
  md: CardPadding.MD,
  sm: CardPadding.SM,
  xs: CardPadding.SM,
};

const VALUE_SIZE: Record<MetricCardSize, string> = {
  lg: 'text-4xl sm:text-5xl',
  md: 'text-3xl',
  sm: 'text-2xl',
  xs: 'text-lg',
};

const VALUE_SKELETON: Record<MetricCardSize, string> = {
  lg: 'h-12 w-24',
  md: 'h-9 w-16',
  sm: 'h-7 w-12',
  xs: 'h-5 w-10',
};

const LABEL_CLASS =
  'text-2xs font-bold uppercase tracking-[0.16em] text-muted-foreground';

const VALUE_CLASS = 'font-semibold tracking-[-0.02em] tabular-nums';

const VALUE_TONE: Record<MetricCardTone, string> = {
  accent: 'text-accent',
  default: 'text-foreground',
  destructive: 'text-destructive',
  info: 'text-info',
  muted: 'text-muted-foreground',
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
};

const ICON_TONE: Record<MetricCardTone, string> = {
  accent: 'bg-accent/10 text-accent',
  default: 'bg-muted text-foreground/50',
  destructive: 'bg-destructive/10 text-destructive',
  info: 'bg-info/10 text-info',
  muted: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
};

function AnimatedValue({ value }: { value: string }): ReactElement {
  const match = value.match(/^([\d.]+)(.*)$/);
  const numericValue = match ? Number.parseFloat(match[1]) : 0;
  const suffix = match ? match[2] || '' : '';
  const decimalMatch = match ? match[1].match(/\.(\d+)/) : null;
  const decimals = decimalMatch ? decimalMatch[1].length : 0;

  const { ref, value: animatedValue } = useAnimatedCounter({
    decimals,
    duration: 800,
    end: numericValue,
    suffix,
  });

  if (!match) {
    return <>{value}</>;
  }

  return <span ref={ref}>{animatedValue}</span>;
}

function resolveValueContent(
  value: ReactNode,
  isLoading: boolean,
  size: MetricCardSize,
): ReactNode {
  if (isLoading) {
    return (
      <Skeleton
        aria-hidden="true"
        className={cn('inline-block rounded-sm', VALUE_SKELETON[size])}
      />
    );
  }

  if (typeof value === 'string' && /^[\d.]+[KMB]?$/.test(value)) {
    return <AnimatedValue value={value} />;
  }

  return value;
}

/**
 * Canonical metric tile for the whole app.
 *
 * **One component, states via props** — do not invent StatCard / KPICard /
 * SummaryMetricCard / raw metric divs:
 * - `appearance="tile"` (default) — framed {@link Card}: the value first and
 *   largest, the label under it, then the detail line
 * - `appearance="inset"` — the same tile as a recessed panel inside a card
 * - `appearance="inline"` — frameless value/label pair for {@link MetricSummary}
 * - `size` — xs / sm / md / lg scale only
 * - `align` — start (default) or center
 * - `tone` — state colour of the value and icon chip
 * - `trend` — optional; omit to hide
 *
 * Surface frame is always {@link Card}.
 */
const MetricCard = memo(function MetricCard({
  align = 'start',
  analyticsMetric,
  analyticsMetricVariant,
  appearance = 'tile',
  className,
  description,
  icon: Icon,
  isLoading = false,
  label,
  size = 'md',
  tone = 'default',
  trend,
  trendLabel,
  value,
}: MetricCardProps): ReactElement {
  const hasTrend = typeof trend === 'number';
  const isPositiveTrend = hasTrend && trend > 0;
  const isNegativeTrend = hasTrend && trend < 0;
  const TrendIcon = isPositiveTrend
    ? TrendingUp
    : isNegativeTrend
      ? TrendingDown
      : null;

  const labelNode = analyticsMetric ? (
    <AnalyticsMetricLabel
      metric={analyticsMetric}
      variant={analyticsMetricVariant}
    >
      {label}
    </AnalyticsMetricLabel>
  ) : (
    label
  );

  const valueNode = (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
      <p className={cn(VALUE_CLASS, VALUE_SIZE[size], VALUE_TONE[tone])}>
        {isLoading ? value : resolveValueContent(value, false, size)}
      </p>

      {hasTrend && !isLoading ? (
        <span
          className={cn(
            'inline-flex items-center gap-1 text-xs font-medium tabular-nums',
            isPositiveTrend && 'text-success',
            isNegativeTrend && 'text-destructive',
            !isPositiveTrend && !isNegativeTrend && 'text-muted-foreground',
          )}
        >
          {TrendIcon ? <TrendIcon className="size-3.5" aria-hidden /> : null}
          {isPositiveTrend ? '+' : ''}
          {Math.round(trend * 10) / 10}%
          {trendLabel ? (
            <span className="font-normal text-muted-foreground">
              {trendLabel}
            </span>
          ) : null}
        </span>
      ) : null}
    </div>
  );

  if (appearance === 'inline') {
    return (
      <span
        className={cn('inline-flex items-baseline gap-1.5', className)}
        data-testid="metric-card"
        data-appearance="inline"
      >
        <span className={cn('font-medium tabular-nums', VALUE_TONE[tone])}>
          {resolveValueContent(value, isLoading, 'sm')}
        </span>
        <span className="text-foreground/60">{labelNode}</span>
      </span>
    );
  }

  return (
    <Card
      bodyClassName="h-full"
      gap={CardGap.NONE}
      padding={BODY_PADDING[size]}
      variant={appearance === 'inset' ? CardVariant.INSET : undefined}
      className={cn('h-full', className)}
      data-testid="metric-card"
      data-appearance={appearance}
      isLoading={isLoading}
      loadingLabel={`Loading ${label}`}
    >
      <div
        className={cn(
          'flex items-start justify-between gap-3',
          align === 'center' && 'justify-center',
        )}
      >
        {valueNode}
        {Icon ? (
          <span
            aria-hidden="true"
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-md',
              ICON_TONE[tone],
              size === 'lg' && 'size-10',
            )}
          >
            <Icon className={size === 'lg' ? 'size-5' : 'size-4'} />
          </span>
        ) : null}
      </div>

      <p
        className={cn(
          LABEL_CLASS,
          'mt-1.5',
          align === 'center' && 'text-center',
        )}
      >
        {labelNode}
      </p>

      {description ? (
        <p className="mt-1 text-xs leading-5 text-foreground/60">
          {description}
        </p>
      ) : null}
    </Card>
  );
});

/**
 * Dense multi-metric strip: `3 accounts · 1 need attention · 2 healthy`.
 * Prefer this over nesting {@link MetricCardGrid} of tiny tiles inside a surface.
 */
export function MetricSummary({
  className,
  items,
  'data-testid': dataTestId = 'metric-summary',
}: MetricSummaryProps): ReactElement {
  return (
    <p
      className={cn('text-xs tabular-nums text-foreground/60', className)}
      data-testid={dataTestId}
    >
      {keyListItems(items, (item) => item.label).map(({ item, key }, index) => (
        <span key={key}>
          {index > 0 ? (
            <span className="mx-1.5 text-foreground/40" aria-hidden>
              ·
            </span>
          ) : null}
          <MetricCard
            appearance="inline"
            label={item.label}
            value={item.value}
          />
        </span>
      ))}
    </p>
  );
}

export default MetricCard;
export type {
  MetricCardAppearance,
  MetricCardProps,
  MetricCardSize,
  MetricCardTone,
  MetricSummaryItem,
  MetricSummaryProps,
};
