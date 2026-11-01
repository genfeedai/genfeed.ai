'use client';

import { useAnalyticsContext } from '@contexts/analytics/analytics-context';
import {
  ButtonVariant,
  CardPadding,
  CardTone,
  CardVariant,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { IStreakMilestoneState } from '@genfeedai/contracts/types';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { STREAK_CELEBRATION_EVENT } from '@services/engagement/streak-events';
import Card from '@ui/card/Card';
import MetricCard from '@ui/cards/metric-card/MetricCard';
import { MetricCardGrid } from '@ui/cards/metric-card/MetricCardGrid';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import { Skeleton } from '@ui/primitives/skeleton';
import { Flame, Gift, ShieldCheck, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import CreationHeatmap from '@/components/analytics/creation-heatmap/CreationHeatmap';
import StreakCelebrationBurst from '@/features/streaks/components/feedback/streak-celebration/StreakCelebrationBurst';
import { useStreak } from '@/hooks/data/streaks/use-streak/use-streak';

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
  const { href } = useOrgUrl();
  const { calendar, isLoading, streak } = useStreak();
  const { setToolbarNode } = useAnalyticsContext();
  const [isCelebrating, setIsCelebrating] = useState(false);
  const createHref = href(APP_ROUTES.AGENT.NEW);

  useEffect(() => {
    setToolbarNode(
      <Button asChild variant={ButtonVariant.DEFAULT}>
        {/* One-off generation is Agent-first. */}
        <Link href={createHref}>
          <Sparkles className="size-4" />
          Create content now
        </Link>
      </Button>,
    );
    return () => setToolbarNode(null);
  }, [createHref, setToolbarNode]);

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
    <div className="flex w-full flex-col gap-6">
      <Card
        variant={CardVariant.INSET}
        padding={CardPadding.XL}
        as="section"
        className="relative overflow-hidden"
      >
        <StreakCelebrationBurst isVisible={isCelebrating} />
        <h1 className="sr-only">{heroTitle}</h1>

        <MetricCardGrid columns={4}>
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
        </MetricCardGrid>
      </Card>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
        <Card
          padding={CardPadding.LG}
          aria-label="Creation heatmap, last 90 days"
          role="group"
        >
          <CreationHeatmap calendar={calendar} isLoading={isLoading} />
        </Card>

        <Card padding={CardPadding.LG}>
          {isLoading ? (
            <div
              className="space-y-3"
              data-testid="streaks-milestones-skeleton"
            >
              <Skeleton className="h-16 rounded-2xl" />
              <Skeleton className="h-16 rounded-2xl" />
              <Skeleton className="h-16 rounded-2xl" />
            </div>
          ) : (
            <>
              {badgeMilestones.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {badgeMilestones.map((milestone) => (
                    <Badge key={milestone} variant="success">
                      <Gift className="size-3.5" />
                      {milestone}-day badge
                    </Badge>
                  ))}
                </div>
              )}

              <div className="space-y-3">
                {milestoneStates.map((milestone) => (
                  <Card
                    key={milestone.days}
                    variant={CardVariant.INSET}
                    tone={
                      milestone.isAchieved
                        ? CardTone.SUCCESS
                        : milestone.isNext
                          ? CardTone.WARNING
                          : undefined
                    }
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
                        <p className="mt-1 text-sm text-foreground/70">
                          {rewardLabel(milestone)}
                        </p>
                      </div>

                      <Badge
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
                  </Card>
                ))}
              </div>
            </>
          )}
        </Card>
      </section>
    </div>
  );
}
