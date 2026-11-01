import type { IStreakMilestoneState } from '@genfeedai/contracts/types';
import { cn } from '@helpers/formatting/cn/cn.util';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import { Flame, Gift, ShieldCheck } from 'lucide-react';
import type { Props } from '@/features/settings/props/settings-progress-rewards-card.props';

function rewardLabel(milestone: IStreakMilestoneState): string {
  if (milestone.days === 7) {
    return 'Freeze unlocked';
  }

  if (milestone.rewardCredits > 0) {
    return `${milestone.rewardCredits} credits + badge`;
  }

  return 'Milestone reached';
}

export default function SettingsProgressRewardsCard({
  badgeMilestones,
  milestoneStates,
}: Props) {
  return (
    <Card
      label="Earned streak rewards"
      description="Badge milestones unlock at 30, 100, and 365 days."
    >
      <div className="flex flex-wrap gap-2">
        {badgeMilestones.length > 0 ? (
          badgeMilestones.map((milestone) => (
            <Badge key={milestone} variant="success">
              <Gift className="size-3.5" />
              {milestone}-day badge
            </Badge>
          ))
        ) : (
          <span className="text-sm text-foreground/60">No badges yet.</span>
        )}
      </div>

      <div className="divide-y divide-border">
        {milestoneStates.map((milestone) => (
          <div
            key={milestone.days}
            className={cn(
              'py-4 first:pt-0 last:pb-0',
              milestone.isAchieved && 'text-emerald-700 dark:text-emerald-100',
              milestone.isNext && 'text-orange-700 dark:text-orange-100',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold text-foreground">
                    {milestone.days} days
                  </span>
                  {milestone.days === 7 ? (
                    <ShieldCheck className="size-4 text-info" />
                  ) : milestone.rewardCredits > 0 ? (
                    <Gift className="size-4 text-success" />
                  ) : (
                    <Flame className="size-4 text-warning" />
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
