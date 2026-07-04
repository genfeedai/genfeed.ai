'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import type { SetupCardStep } from '@hooks/utils/use-setup-card/use-setup-card';
import Card from '@ui/card/Card';
import KeyMetric from '@ui/display/key-metric/KeyMetric';
import Link from 'next/link';
import { HiOutlineSparkles } from 'react-icons/hi2';

type NextMilestone = {
  days: number;
  remaining: number;
  rewardCredits: number;
} | null;

type Props = {
  completedCount: number;
  totalCount: number;
  isLoading: boolean;
  currentStreak: number;
  longestStreak: number;
  nextMilestone: NextMilestone;
  nextSetupStep: SetupCardStep | null;
  orgHref: (href: string) => string;
};

export default function SettingsProgressOverviewCard({
  completedCount,
  totalCount,
  isLoading,
  currentStreak,
  longestStreak,
  nextMilestone,
  nextSetupStep,
  orgHref,
}: Props) {
  return (
    <Card className="border-white/10 bg-white/[0.03] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Progress
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">
            Review setup and streaks
          </h1>
          <p className="mt-3 text-sm leading-6 text-foreground/65">
            Check setup progress, streak status, milestone rewards, and the
            sidebar module preference in one place.
          </p>
        </div>

        {nextSetupStep ? (
          <Link
            href={orgHref(nextSetupStep.href)}
            className="inline-flex items-center gap-2 rounded-full border border-orange-400/25 bg-orange-400/10 px-4 py-2 text-sm font-medium text-orange-100 transition-colors hover:bg-orange-400/15"
          >
            <HiOutlineSparkles className="size-4" />
            Finish {nextSetupStep.label}
          </Link>
        ) : (
          <Link
            href={APP_ROUTES.COMPOSE.ROOT}
            className="inline-flex items-center gap-2 rounded-full border border-orange-400/25 bg-orange-400/10 px-4 py-2 text-sm font-medium text-orange-100 transition-colors hover:bg-orange-400/15"
          >
            <HiOutlineSparkles className="size-4" />
            Create something new
          </Link>
        )}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <KeyMetric label="Setup" value={`${completedCount}/${totalCount}`} />
        <KeyMetric
          label="Current streak"
          value={isLoading ? '...' : currentStreak}
        />
        <KeyMetric
          label="Longest streak"
          value={isLoading ? '...' : longestStreak}
        />
        <KeyMetric
          description={
            isLoading
              ? 'Loading streak'
              : nextMilestone
                ? `${nextMilestone.remaining} day${nextMilestone.remaining === 1 ? '' : 's'} remaining`
                : 'All milestone tiers reached'
          }
          label="Next milestone"
          value={
            isLoading ? '...' : nextMilestone ? nextMilestone.days : 'Done'
          }
        />
      </div>
    </Card>
  );
}
