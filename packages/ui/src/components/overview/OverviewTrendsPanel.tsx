import { ButtonVariant } from '@genfeedai/contracts';
import type { TrendItem } from '@genfeedai/props/trends/trends-page.props';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Skeleton } from '@ui/primitives/skeleton';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

import {
  WorkspaceSurface,
  type WorkspaceSurfaceTone,
} from './WorkspaceSurface';

function formatViralityScore(score: number): string {
  if (score >= 1000) {
    return `${(score / 1000).toFixed(1)}k`;
  }
  return String(Math.round(score));
}

export interface OverviewTrendsPanelProps {
  isLoading: boolean;
  trends: TrendItem[];
  viewAllHref: string;
  /** Surface tone; defaults to the canonical dashboard card surface */
  tone?: WorkspaceSurfaceTone;
}

export function OverviewTrendsPanel({
  isLoading,
  trends,
  viewAllHref,
  tone = 'card',
}: OverviewTrendsPanelProps) {
  const topTrends = useMemo(
    () =>
      trends.toSorted((a, b) => b.viralityScore - a.viralityScore).slice(0, 5),
    [trends],
  );

  return (
    <WorkspaceSurface
      eyebrow="Social Trends"
      title="Research Trends"
      tone={tone}
      className="flex h-full flex-col gap-4"
      data-testid="overview-trends-panel"
      actions={
        <Button asChild variant={ButtonVariant.SECONDARY}>
          <Link href={viewAllHref}>
            <ArrowRight className="size-4" />
            View All
          </Link>
        </Button>
      }
    >
      {isLoading ? (
        <div
          data-testid="overview-trends-loading"
          className="space-y-3"
          aria-busy="true"
        >
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton
              // biome-ignore lint/suspicious/noArrayIndexKey: Fixed layout slots have positional identity and no item state.
              key={index}
              className="h-10 rounded-[0.75rem]"
            />
          ))}
        </div>
      ) : topTrends.length === 0 ? (
        <div
          data-testid="overview-trends-empty"
          className="flex items-center justify-center rounded-card bg-background p-8 text-sm text-foreground/55 shadow-border"
        >
          No trends yet.
        </div>
      ) : (
        <div className="space-y-2" data-testid="overview-trends-list">
          {topTrends.map((trend) => (
            <div
              key={trend.id}
              className="flex items-center gap-3 rounded-card bg-background px-4 py-3 shadow-border"
            >
              <Badge className="shrink-0" variant="secondary">
                {trend.platform}
              </Badge>

              <span
                className="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
                title={trend.topic}
              >
                {trend.topic}
              </span>

              <span className="shrink-0 text-2xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {formatViralityScore(trend.viralityScore)}
              </span>
            </div>
          ))}
        </div>
      )}
    </WorkspaceSurface>
  );
}
