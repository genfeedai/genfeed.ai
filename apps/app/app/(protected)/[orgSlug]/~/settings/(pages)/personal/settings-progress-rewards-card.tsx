'use client';

import type { IStreakMilestoneState } from '@genfeedai/types';
import { cn } from '@helpers/formatting/cn/cn.util';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import {
  HiOutlineFire,
  HiOutlineGift,
  HiOutlineShieldCheck,
} from 'react-icons/hi2';

function rewardLabel(milestone: IStreakMilestoneState): string {
  if (milestone.days === 7) {
    return 'Freeze unlocked';
  }

  if (milestone.rewardCredits > 0) {
    return `${milestone.rewardCredits} credits + badge`;
  }

  return 'Milestone reached';
}

type Props = {
  badgeMilestones: number[];
  milestoneStates: IStreakMilestoneState[];
};

export default function SettingsProgressRewardsCard({
  badgeMilestones,
  milestoneStates,
}: Props) {
  return (
    <Card className="border-white/10 bg-card p-5">
      <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
        Badge progress
      </p>
      <h2 className="mt-1 text-xl font-semibold text-foreground">
        Earned streak rewards
      </h2>

      <div className="mt-4 flex flex-wrap gap-2">
        {badgeMilestones.length > 0 ? (
          badgeMilestones.map((milestone) => (
            <Badge
              className="px-3 py-1 text-xs font-semibold"
              key={milestone}
              variant="success"
            >
              <HiOutlineGift className="size-3.5" />
              {milestone}-day badge
            </Badge>
          ))
        ) : (
          <span className="text-sm text-foreground/60">
            Badge milestones unlock at 30, 100, and 365 days.
          </span>
        )}
      </div>

      <div className="mt-6 divide-y divide-white/10">
        {milestoneStates.map((milestone) => (
          <div
            key={milestone.days}
            className={cn(
              'py-4 first:pt-0 last:pb-0',
              milestone.isAchieved && 'text-emerald-100',
              milestone.isNext && 'text-orange-100',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold text-foreground">
                    {milestone.days} days
                  </span>
                  {milestone.days === 7 ? (
                    <HiOutlineShieldCheck className="size-4 text-sky-300" />
                  ) : milestone.rewardCredits > 0 ? (
                    <HiOutlineGift className="size-4 text-emerald-300" />
                  ) : (
                    <HiOutlineFire className="size-4 text-orange-300" />
                  )}
                </div>
                <p className="mt-1 text-sm text-foreground/65">
                  {rewardLabel(milestone)}
                </p>
              </div>

              <Badge
                className="px-2.5 py-1 text-[11px] font-medium"
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
                    ? 'Next up'
                    : 'Locked'}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
