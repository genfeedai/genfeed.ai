import {
  ButtonVariant,
  CardPadding,
  CardVariant,
  ComponentSize,
} from '@genfeedai/contracts';
import type { TrendItem } from '@genfeedai/props/trends/trends-page.props';
import Card from '@ui/card/Card';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
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
        <Card
          variant={CardVariant.INSET}
          padding={CardPadding.XL}
          bodyClassName="flex-row items-center justify-center"
          data-testid="overview-trends-empty"
        >
          <div className="text-sm text-foreground/60">No trends yet.</div>
        </Card>
      ) : (
        <div className="space-y-2" data-testid="overview-trends-list">
          {topTrends.map((trend) => (
            <Card
              variant={CardVariant.INSET}
              padding={CardPadding.SM}
              bodyClassName="flex-row items-center"
              key={trend.id}
            >
              <PlatformBadge
                platform={trend.platform}
                size={ComponentSize.SM}
              />

              <span
                className="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
                title={trend.topic}
              >
                {trend.topic}
              </span>

              <span className="shrink-0 text-2xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {formatViralityScore(trend.viralityScore)}
              </span>
            </Card>
          ))}
        </div>
      )}
    </WorkspaceSurface>
  );
}
