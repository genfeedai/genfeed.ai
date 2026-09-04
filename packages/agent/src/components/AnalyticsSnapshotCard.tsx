'use client';

import { AgentCardCollapseToggle } from '@genfeedai/agent/components/AgentCardCollapseToggle';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { extractAnalyticsPeriod } from '@genfeedai/agent/utils/extract-analytics-period';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import Card from '@ui/card/Card';
import Tabs from '@ui/navigation/tabs/Tabs';
import { Button } from '@ui/primitives/button';
import { buttonVariants } from '@ui/primitives/button.variants';
import {
  ChartColumn,
  Eye,
  Heart,
  MessageCircle,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { type ReactElement, useMemo, useState } from 'react';

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

interface PeriodSnapshot {
  period: string;
  metrics?: Record<string, unknown>;
  title?: string;
}

const PREVIEW_METRIC_COUNT = 2;

function resolvePeriodSnapshots(action: AgentUiAction): PeriodSnapshot[] {
  const raw = action.data?.periodSnapshots;
  if (Array.isArray(raw) && raw.length > 0) {
    return (
      raw
        // The return type is annotated rather than inferred: an inferred
        // `metrics: Record<string, unknown> | undefined` is a *required* property,
        // which the optional `metrics?` on PeriodSnapshot does not satisfy, and the
        // filter predicate below then fails to narrow.
        .map((entry): PeriodSnapshot | null => {
          if (!entry || typeof entry !== 'object') {
            return null;
          }
          const record = entry as Record<string, unknown>;
          const period =
            typeof record.period === 'string'
              ? record.period
              : extractAnalyticsPeriod(action);
          return {
            period,
            metrics:
              record.metrics && typeof record.metrics === 'object'
                ? (record.metrics as Record<string, unknown>)
                : undefined,
            title: typeof record.title === 'string' ? record.title : undefined,
          };
        })
        .filter((entry): entry is PeriodSnapshot => entry !== null)
    );
  }

  return [
    {
      metrics: action.metrics,
      period: extractAnalyticsPeriod(action),
      title: action.title,
    },
  ];
}

function buildMetrics(data: Record<string, unknown> | undefined): MetricData[] {
  const itemMetrics = Array.isArray(data?.items)
    ? ((data.items as AnalyticsMetricItem[]).map((item) => ({
        change: item.change,
        icon: getMetricIcon(item.label),
        label: item.label,
        value: formatMetricValue(item),
      })) satisfies MetricData[])
    : null;

  if (itemMetrics && itemMetrics.length > 0) {
    return itemMetrics;
  }

  return [
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
}

export function AnalyticsSnapshotCard({
  action,
}: AnalyticsSnapshotCardProps): ReactElement {
  const { orgHref } = useOrgUrl();
  const periodSnapshots = useMemo(
    () => resolvePeriodSnapshots(action),
    [action],
  );
  const defaultPeriod =
    periodSnapshots[periodSnapshots.length - 1]?.period ??
    extractAnalyticsPeriod(action);
  const [selectedPeriod, setSelectedPeriod] = useState(defaultPeriod);
  const [isExpanded, setIsExpanded] = useState(true);

  const activeSnapshot =
    periodSnapshots.find((snapshot) => snapshot.period === selectedPeriod) ??
    periodSnapshots[0];
  const metrics = buildMetrics(activeSnapshot?.metrics ?? action.metrics);
  const previewMetrics = metrics.slice(0, PREVIEW_METRIC_COUNT);
  const hasMoreMetrics = metrics.length > PREVIEW_METRIC_COUNT;
  const analyticsHref = orgHref('/analytics/overview');

  return (
    <Card className="my-2 isolate" bodyClassName="gap-0 p-0">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        <ChartColumn className="size-5 shrink-0 text-primary" />
        <h3 className="min-w-0 flex-1 text-sm font-semibold text-foreground">
          Analytics summary
        </h3>
        {periodSnapshots.length > 1 ? (
          <Tabs
            activeTab={selectedPeriod}
            ariaLabel="Analytics period"
            fullWidth={false}
            items={periodSnapshots.map((snapshot) => ({
              id: snapshot.period,
              label: snapshot.period,
            }))}
            onTabChange={(period) => {
              setSelectedPeriod(period);
              setIsExpanded(true);
            }}
          />
        ) : (
          <span className="shrink-0 text-2xs font-medium text-muted-foreground">
            {selectedPeriod}
          </span>
        )}
        <AgentCardCollapseToggle
          isCollapsed={!isExpanded}
          labelCollapse="Collapse analytics"
          labelExpand="Expand analytics"
          onToggle={() => {
            setIsExpanded((current) => !current);
          }}
        />
      </div>

      {!isExpanded ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-xs text-muted-foreground">
          {previewMetrics.map((metric) => (
            <span
              key={metric.label}
              className="inline-flex items-center gap-1.5"
            >
              <span className="text-foreground/70">{metric.label}</span>
              <span className="font-semibold text-foreground">
                {metric.value}
              </span>
            </span>
          ))}
          {hasMoreMetrics ? (
            <Button
              type="button"
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => {
                setIsExpanded(true);
              }}
            >
              View more
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3 p-4">
          {action.description ? (
            <p className="text-xs text-muted-foreground">
              {action.description}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            {metrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-md border border-border/60 bg-tertiary p-3"
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
                        metric.change >= 0
                          ? 'text-success'
                          : 'text-destructive',
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
          <div className="flex flex-wrap gap-2">
            <a
              href={analyticsHref}
              className={cn(
                buttonVariants({
                  size: ButtonSize.SM,
                  variant: ButtonVariant.SECONDARY,
                }),
                'inline-flex w-fit no-underline',
              )}
            >
              Open analytics
            </a>
            <Button
              type="button"
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              withWrapper={false}
              className="text-xs"
              onClick={() => {
                setIsExpanded(false);
              }}
            >
              Show less
            </Button>
          </div>
        </div>
      )}
    </Card>
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
