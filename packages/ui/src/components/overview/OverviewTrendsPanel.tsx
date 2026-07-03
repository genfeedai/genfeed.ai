import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { TrendItem } from '@genfeedai/props/trends/trends-page.props';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useMemo } from 'react';
import { HiOutlineArrowRight } from 'react-icons/hi2';
import {
  WorkspaceSurface,
  type WorkspaceSurfaceTone,
} from './WorkspaceSurface';

const PLATFORM_BADGE_CLASSES: Record<string, string> = {
  instagram: 'bg-fuchsia-500/12 text-fuchsia-300 border-fuchsia-500/20',
  tiktok: 'bg-zinc-500/12 text-zinc-200 border-zinc-500/20',
  twitter: 'bg-sky-500/12 text-sky-300 border-sky-500/20',
  youtube: 'bg-rose-500/12 text-rose-300 border-rose-500/20',
  linkedin: 'bg-blue-500/12 text-blue-300 border-blue-500/20',
  reddit: 'bg-orange-500/12 text-orange-300 border-orange-500/20',
  pinterest: 'bg-red-500/12 text-red-300 border-red-500/20',
  facebook: 'bg-indigo-500/12 text-indigo-300 border-indigo-500/20',
};

const DEFAULT_BADGE_CLASS = 'bg-zinc-500/12 text-zinc-300 border-zinc-500/20';

function getPlatformBadgeClass(platform: string): string {
  return PLATFORM_BADGE_CLASSES[platform.toLowerCase()] ?? DEFAULT_BADGE_CLASS;
}

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
            <HiOutlineArrowRight className="size-4" />
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
            <div
              key={index}
              className="h-10 animate-pulse rounded-[0.75rem] bg-muted/40"
            />
          ))}
        </div>
      ) : topTrends.length === 0 ? (
        <div
          data-testid="overview-trends-empty"
          className="ship-ui gen-shell-empty-state flex items-center justify-center rounded-[1rem] p-8 text-sm text-foreground/55"
        >
          No trends yet.
        </div>
      ) : (
        <div className="space-y-2" data-testid="overview-trends-list">
          {topTrends.map((trend) => (
            <div
              key={trend.id}
              className="ship-ui gen-shell-surface flex items-center gap-3 rounded-[1rem] border-white/[0.06] bg-background/52 px-4 py-3"
            >
              <span
                className={cn(
                  'shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]',
                  getPlatformBadgeClass(trend.platform),
                )}
              >
                {trend.platform}
              </span>

              <span
                className="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
                title={trend.topic}
              >
                {trend.topic}
              </span>

              <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/45">
                {formatViralityScore(trend.viralityScore)}
              </span>
            </div>
          ))}
        </div>
      )}
    </WorkspaceSurface>
  );
}
