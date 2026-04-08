import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import type { ReactElement } from 'react';
import {
  HiArrowTrendingDown,
  HiArrowTrendingUp,
  HiChartBar,
  HiChatBubbleLeft,
  HiEye,
  HiHeart,
} from 'react-icons/hi2';

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
            icon: <HiEye className="w-4 h-4" />,
            label: 'Views',
            value: formatNumber((data?.views as number) ?? 0),
          },
          {
            change: data?.likesChange as number | undefined,
            icon: <HiHeart className="w-4 h-4" />,
            label: 'Likes',
            value: formatNumber((data?.likes as number) ?? 0),
          },
          {
            change: data?.commentsChange as number | undefined,
            icon: <HiChatBubbleLeft className="w-4 h-4" />,
            label: 'Comments',
            value: formatNumber((data?.comments as number) ?? 0),
          },
          {
            change: data?.engagementChange as number | undefined,
            icon: <HiChartBar className="w-4 h-4" />,
            label: 'Engagement',
            value: `${((data?.engagementRate as number) ?? 0).toFixed(1)}%`,
          },
        ];

  return (
    <div className="border border-border bg-background p-4 my-2">
      <div className="flex items-center gap-2 mb-3">
        <HiChartBar className="w-5 h-5 text-blue-500" />
        <h3 className="font-semibold text-sm">
          {action.title || 'Analytics Snapshot'}
        </h3>
      </div>
      {action.description && (
        <p className="text-xs text-muted-foreground mb-3">
          {action.description}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="bg-muted p-3">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
              {metric.icon}
              <span className="text-xs">{metric.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold">{metric.value}</span>
              {metric.change != null && (
                <span
                  className={`flex items-center text-xs ${
                    metric.change >= 0 ? 'text-green-500' : 'text-red-500'
                  }`}
                >
                  {metric.change >= 0 ? (
                    <HiArrowTrendingUp className="w-3 h-3 mr-0.5" />
                  ) : (
                    <HiArrowTrendingDown className="w-3 h-3 mr-0.5" />
                  )}
                  {Math.abs(metric.change).toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      {action.ctas && action.ctas.length > 0 && (
        <div className="flex gap-2 mt-3">
          {action.ctas.map((cta) => (
            <a
              key={cta.label}
              href={cta.href}
              className="text-xs px-3 py-1.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
            >
              {cta.label}
            </a>
          ))}
        </div>
      )}
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
    return <HiEye className="w-4 h-4" />;
  }

  if (normalizedLabel.includes('like')) {
    return <HiHeart className="w-4 h-4" />;
  }

  if (normalizedLabel.includes('comment')) {
    return <HiChatBubbleLeft className="w-4 h-4" />;
  }

  return <HiChartBar className="w-4 h-4" />;
}
