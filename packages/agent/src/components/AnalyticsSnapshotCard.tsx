import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { buttonVariants } from '@ui/primitives/button.variants';
import {
  ChartColumn,
  Eye,
  Heart,
  MessageCircle,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { ReactElement } from 'react';

interface AnalyticsSnapshotCardProps {
  action: AgentUiAction;
}

interface MetricData {
  label: string;
  value: number | string;
  change?: number;
  icon: ReactElement;
}

interface AnalyticsMetricItem {
  change?: number;
  decimals?: number;
  label: string;
  suffix?: string;
  value: number;
}

export function AnalyticsSnapshotCard({
  action,
}: AnalyticsSnapshotCardProps): ReactElement {
  const data = action.metrics;
  const itemMetrics = Array.isArray(data?.items)
    ? ((data.items as AnalyticsMetricItem[]).map((item) => ({
        change: item.change,
        icon: getMetricIcon(item.label),
        label: item.label,
        value: formatMetricValue(item),
      })) satisfies MetricData[])
    : null;

  const metrics: MetricData[] =
    itemMetrics && itemMetrics.length > 0
      ? itemMetrics
      : [
          {
            change: data?.viewsChange as number | undefined,
            icon: <Eye className="size-4" />,
            label: 'Views',
            value: formatNumber((data?.views as number) ?? 0),
          },
          {
            change: data?.likesChange as number | undefined,
            icon: <Heart className="size-4" />,
            label: 'Likes',
            value: formatNumber((data?.likes as number) ?? 0),
          },
          {
            change: data?.commentsChange as number | undefined,
            icon: <MessageCircle className="size-4" />,
            label: 'Comments',
            value: formatNumber((data?.comments as number) ?? 0),
          },
          {
            change: data?.engagementChange as number | undefined,
            icon: <ChartColumn className="size-4" />,
            label: 'Engagement',
            value: `${((data?.engagementRate as number) ?? 0).toFixed(1)}%`,
          },
        ];

  return (
    <div className="relative isolate my-2 overflow-hidden rounded-xl border border-border bg-background-secondary p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <ChartColumn className="size-5 shrink-0 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">
          {action.title || 'Analytics Snapshot'}
        </h3>
      </div>
      {action.description ? (
        <p className="mb-3 text-xs text-muted-foreground">
          {action.description}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-lg border border-border/60 bg-background p-3"
          >
            <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
              {metric.icon}
              <span className="text-xs">{metric.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-foreground">
                {metric.value}
              </span>
              {metric.change != null ? (
                <span
                  className={cn(
                    'flex items-center text-xs',
                    metric.change >= 0 ? 'text-green-500' : 'text-red-500',
                  )}
                >
                  {metric.change >= 0 ? (
                    <TrendingUp className="mr-0.5 size-3" />
                  ) : (
                    <TrendingDown className="mr-0.5 size-3" />
                  )}
                  {Math.abs(metric.change).toFixed(1)}%
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {action.ctas && action.ctas.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {action.ctas.map((cta) => (
            <a
              key={cta.label}
              href={cta.href}
              className={cn(
                buttonVariants({
                  size: ButtonSize.SM,
                  variant: ButtonVariant.SECONDARY,
                }),
                'inline-flex w-fit no-underline',
              )}
            >
              {cta.label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
}

function formatMetricValue(metric: AnalyticsMetricItem): string {
  const decimals = metric.decimals ?? 0;
  const formattedNumber =
    decimals > 0 ? metric.value.toFixed(decimals) : formatNumber(metric.value);
  return `${formattedNumber}${metric.suffix ?? ''}`;
}

function getMetricIcon(label: string): ReactElement {
  const normalizedLabel = label.toLowerCase();

  if (normalizedLabel.includes('view')) {
    return <Eye className="size-4" />;
  }

  if (normalizedLabel.includes('like')) {
    return <Heart className="size-4" />;
  }

  if (normalizedLabel.includes('comment')) {
    return <MessageCircle className="size-4" />;
  }

  return <ChartColumn className="size-4" />;
}
