'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { ButtonVariant } from '@genfeedai/enums';
import type { IStreakMilestoneState } from '@genfeedai/types';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useStreak } from '@hooks/data/streaks/use-streak/use-streak';
import { STREAK_CELEBRATION_EVENT } from '@services/engagement/streak-events';
import MetricCard from '@ui/cards/metric-card/MetricCard';
import Badge from '@ui/display/badge/Badge';
import StreakCelebrationBurst from '@ui/feedback/streak-celebration/StreakCelebrationBurst';
import { Button } from '@ui/primitives/button';
import { Flame, Gift, ShieldCheck, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

function formatDayKey(offsetFromEnd: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetFromEnd);
  return date.toISOString().slice(0, 10);
}

function rewardLabel(milestone: IStreakMilestoneState): string {
  if (milestone.days === 7) {
    return 'Freeze unlocked';
  }

  if (milestone.rewardCredits > 0) {
    return `${milestone.rewardCredits} credits + badge`;
  }

  return 'Milestone reached';
}

export default function StreaksPage() {
  const { calendar, isLoading, streak } = useStreak();
  const [isCelebrating, setIsCelebrating] = useState(false);

  useEffect(() => {
    const handleCelebration = (_event: Event) => {
      setIsCelebrating(true);
      window.setTimeout(() => setIsCelebrating(false), 1600);
    };

    window.addEventListener(
      STREAK_CELEBRATION_EVENT,
      handleCelebration as EventListener,
    );
    return () =>
      window.removeEventListener(
        STREAK_CELEBRATION_EVENT,
        handleCelebration as EventListener,
      );
  }, []);

  const heatmapDays = useMemo(
    () => Array.from({ length: 90 }, (_, index) => formatDayKey(index - 89)),
    [],
  );

  const currentStreak = streak?.currentStreak ?? 0;
  const longestStreak = streak?.longestStreak ?? 0;
  const streakFreezes = streak?.streakFreezes ?? 0;
  const nextMilestone = streak?.nextMilestone;
  const milestoneStates = streak?.milestoneStates ?? [];
  const badgeMilestones = streak?.badgeMilestones ?? [];

  const heroTitle =
    streak?.status === 'broken_recently'
      ? `Your ${streak.lastBrokenStreak ?? 0}-day streak ended.`
      : currentStreak > 0
        ? `${currentStreak}-day streak and climbing.`
        : 'Start your first daily creation streak.';

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <section className="relative overflow-hidden rounded-3xl bg-secondary p-6 shadow-border">
        <StreakCelebrationBurst isVisible={isCelebrating} />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="sr-only">{heroTitle}</h1>

          <Button asChild variant={ButtonVariant.DEFAULT}>
            {/* One-off generation is Agent-first. */}
            <Link href={APP_ROUTES.AGENT.NEW}>
              <Sparkles className="size-4" />
              Create content now
            </Link>
          </Button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <MetricCard
            isLoading={isLoading}
            label="Current streak"
            size="md"
            value={currentStreak}
          />
          <MetricCard
            isLoading={isLoading}
            label="Longest streak"
            size="md"
            value={longestStreak}
          />
          <MetricCard
            isLoading={isLoading}
            label="Freezes"
            size="md"
            value={streakFreezes}
          />
          <MetricCard
            description={
              nextMilestone
                ? `${nextMilestone.remaining} day${nextMilestone.remaining === 1 ? '' : 's'} remaining`
                : 'All milestone tiers reached'
            }
            isLoading={isLoading}
            label="Next milestone"
            size="md"
            value={nextMilestone ? `${nextMilestone.days}` : 'Done'}
          />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
        <div className="rounded-3xl bg-secondary p-5 shadow-border">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                Last 90 days
              </p>
              <h2 className="mt-1 text-xl font-semibold text-foreground">
                Creation heatmap
              </h2>
            </div>
            <p className="text-sm text-foreground/60">
              Darker cells mean more generated or published pieces.
            </p>
          </div>

          {isLoading ? (
            <div
              className="grid grid-cols-9 gap-2 md:grid-cols-15 lg:grid-cols-18"
              data-testid="streaks-heatmap-skeleton"
            >
              {heatmapDays.map((dayKey) => (
                <div
                  key={dayKey}
                  className="aspect-square animate-pulse rounded bg-secondary"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-9 gap-2 md:grid-cols-15 lg:grid-cols-18">
              {heatmapDays.map((dayKey) => {
                const count = calendar[dayKey]?.count ?? 0;
                const intensityClass =
                  count >= 4
                    ? 'bg-foreground/80'
                    : count >= 2
                      ? 'bg-foreground/45'
                      : count >= 1
                        ? 'bg-foreground/25'
                        : 'bg-secondary';

                return (
                  <div
                    key={dayKey}
                    className={cn(
                      'aspect-square rounded transition-colors',
                      intensityClass,
                    )}
                    title={`${dayKey}${count > 0 ? `: ${count} item${count === 1 ? '' : 's'}` : ''}`}
                  />
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-3xl bg-secondary p-5 shadow-border">
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
            Badge progress
          </p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">
            Earned streak rewards
          </h2>

          {isLoading ? (
            <div
              className="mt-6 animate-pulse space-y-3"
              data-testid="streaks-milestones-skeleton"
            >
              <div className="h-16 rounded-2xl bg-secondary" />
              <div className="h-16 rounded-2xl bg-secondary" />
              <div className="h-16 rounded-2xl bg-secondary" />
            </div>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap gap-2">
                {badgeMilestones.length > 0 ? (
                  badgeMilestones.map((milestone) => (
                    <Badge
                      className="px-3 py-1 text-xs font-semibold"
                      key={milestone}
                      variant="success"
                    >
                      <Gift className="size-3.5" />
                      {milestone}-day badge
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-foreground/60">
                    Badge milestones unlock at 30, 100, and 365 days.
                  </span>
                )}
              </div>

              <div className="mt-6 space-y-3">
                {milestoneStates.map((milestone) => (
                  <div
                    key={milestone.days}
                    className={cn(
                      'rounded-2xl p-4',
                      milestone.isAchieved
                        ? 'bg-success/10 shadow-border'
                        : milestone.isNext
                          ? 'bg-warning/10 shadow-border'
                          : 'bg-secondary shadow-border',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-semibold text-foreground">
                            {milestone.days} days
                          </span>
                          {milestone.days === 7 ? (
                            <ShieldCheck className="size-4 text-muted-foreground" />
                          ) : milestone.rewardCredits > 0 ? (
                            <Gift className="size-4 text-muted-foreground" />
                          ) : (
                            <Flame className="size-4 text-muted-foreground" />
                          )}
                        </div>
                        <p className="mt-1 text-sm text-foreground/65">
                          {rewardLabel(milestone)}
                        </p>
                      </div>

                      <Badge
                        className="px-2.5 py-1 text-xs font-semibold"
                        variant={
                          milestone.isAchieved
                            ? 'success'
                            : milestone.isNext
                              ? 'warning'
                              : 'ghost'
                        }
                      >
                        {milestone.isAchieved
                          ? 'Unlocked'
                          : milestone.isNext
                            ? 'Next'
                            : 'Locked'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
