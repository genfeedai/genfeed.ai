'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { buildAgentPromptHref } from '@genfeedai/utils/url/desktop-loop-url.util';
import type { SetupCardStep } from '@hooks/utils/use-setup-card/use-setup-card';
import Card from '@ui/card/Card';
import { MetricSummary } from '@ui/cards/metric-card/MetricCard';
import { Button } from '@ui/primitives/button';
import { Sparkles } from 'lucide-react';
import Link from 'next/link';

// Creating starts in the Agent now that the Compose module is gone.
const CREATE_SOMETHING_AGENT_HREF = buildAgentPromptHref(
  'Help me create something new for my brand.',
);

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
    <Card
      label="Progress"
      description="Check setup progress, streak status, milestone rewards, and the sidebar module preference in one place."
      bodyClassName="gap-3 p-4"
      headerAction={
        nextSetupStep ? (
          <Button
            asChild
            className="inline-flex items-center gap-2 rounded-full border border-orange-400/25 bg-orange-400/10 px-4 py-2 text-sm font-medium text-orange-100 transition-colors hover:bg-orange-400/15"
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
          >
            <Link href={orgHref(nextSetupStep.href)}>
              <Sparkles className="size-4" />
              Finish {nextSetupStep.label}
            </Link>
          </Button>
        ) : (
          <Button
            asChild
            className="inline-flex items-center gap-2 rounded-full border border-orange-400/25 bg-orange-400/10 px-4 py-2 text-sm font-medium text-orange-100 transition-colors hover:bg-orange-400/15"
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
          >
            <Link href={orgHref(CREATE_SOMETHING_AGENT_HREF)}>
              <Sparkles className="size-4" />
              Create something new
            </Link>
          </Button>
        )
      }
    >
      <MetricSummary
        className="flex flex-wrap gap-y-2"
        items={[
          { label: 'setup', value: `${completedCount}/${totalCount}` },
          {
            label: 'current streak',
            value: isLoading ? '...' : currentStreak,
          },
          {
            label: 'longest streak',
            value: isLoading ? '...' : longestStreak,
          },
          {
            label: 'next milestone',
            value: isLoading ? '...' : nextMilestone?.days || 'Done',
          },
        ]}
      />
      <p className="text-xs text-foreground/55">
        {isLoading
          ? 'Loading streak'
          : nextMilestone
            ? `${nextMilestone.remaining} day${nextMilestone.remaining === 1 ? '' : 's'} remaining`
            : 'All milestone tiers reached'}
      </p>
    </Card>
  );
}
