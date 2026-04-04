'use client';

import type { IStreakMilestoneState } from '@cloud/types';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useStreak } from '@hooks/data/streaks/use-streak/use-streak';
import { useSetupCard } from '@hooks/utils/use-setup-card/use-setup-card';
import { useSidebarProgressPreference } from '@hooks/utils/use-sidebar-progress-preference/use-sidebar-progress-preference';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';
import KeyMetric from '@ui/display/key-metric/KeyMetric';
import FormToggle from '@ui/forms/selectors/toggle/form-toggle/FormToggle';
import Link from 'next/link';
import { useMemo } from 'react';
import {
  HiMiniArrowUpRight,
  HiOutlineFire,
  HiOutlineGift,
  HiOutlineShieldCheck,
  HiOutlineSparkles,
} from 'react-icons/hi2';

const settingsToggleClassName =
  'border border-white/8 bg-[rgba(249,115,22,0.14)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] data-[state=checked]:border-[var(--accent-orange)] data-[state=checked]:bg-[var(--accent-orange)] data-[state=unchecked]:hover:bg-[rgba(249,115,22,0.2)]';

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

interface SettingsProgressPageProps {
  showOverviewCard?: boolean;
}

export default function SettingsProgressPage({
  showOverviewCard = true,
}: SettingsProgressPageProps) {
  const { completedCount, steps, totalCount } = useSetupCard();
  const { calendar, isLoading, streak } = useStreak();
  const { isSaving, isVisible, setVisibility } = useSidebarProgressPreference();

  const heatmapDays = useMemo(
    () => Array.from({ length: 90 }, (_, index) => formatDayKey(index - 89)),
    [],
  );

  const currentStreak = streak?.currentStreak ?? 0;
  const longestStreak = streak?.longestStreak ?? 0;
  const nextMilestone = streak?.nextMilestone ?? null;
  const milestoneStates = streak?.milestoneStates ?? [];
  const badgeMilestones = streak?.badgeMilestones ?? [];
  const streakFreezes = streak?.streakFreezes ?? 0;
  const nextSetupStep = steps.find((step) => !step.isCompleted) ?? null;

  return (
    <div className="space-y-6">
      {showOverviewCard && (
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
                href={nextSetupStep.href}
                className="inline-flex items-center gap-2 rounded-full border border-orange-400/25 bg-orange-400/10 px-4 py-2 text-sm font-medium text-orange-100 transition-colors hover:bg-orange-400/15"
              >
                <HiOutlineSparkles className="h-4 w-4" />
                Finish {nextSetupStep.label}
              </Link>
            ) : (
              <Link
                href="/compose"
                className="inline-flex items-center gap-2 rounded-full border border-orange-400/25 bg-orange-400/10 px-4 py-2 text-sm font-medium text-orange-100 transition-colors hover:bg-orange-400/15"
              >
                <HiOutlineSparkles className="h-4 w-4" />
                Create something new
              </Link>
            )}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <KeyMetric
              label="Setup"
              value={`${completedCount}/${totalCount}`}
            />
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
      )}

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-white/10 bg-white/[0.03] p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                Setup checklist
              </p>
              <h2 className="mt-1 text-xl font-semibold text-foreground">
                Review every setup step
              </h2>
            </div>
            <Badge variant="outline" className="px-3 py-1 text-xs font-medium">
              {completedCount}/{totalCount} complete
            </Badge>
          </div>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,rgba(251,146,60,0.95),rgba(249,115,22,0.65))]"
              style={{
                width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%`,
              }}
            />
          </div>

          <div className="mt-5 space-y-3">
            {steps.map((step) => (
              <div
                key={step.key}
                className={cn(
                  'flex items-center justify-between gap-3 rounded-2xl border px-4 py-4',
                  step.isCompleted
                    ? 'border-emerald-400/15 bg-emerald-400/[0.06]'
                    : 'border-white/10 bg-black/10',
                )}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {step.label}
                  </p>
                  <p className="mt-1 text-sm text-foreground/60">
                    {step.description}
                  </p>
                </div>

                <Link
                  href={step.href}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                    step.isCompleted
                      ? 'border border-white/10 text-white/55 hover:bg-white/[0.04]'
                      : 'border border-orange-400/25 bg-orange-400/10 text-orange-100 hover:bg-orange-400/15',
                  )}
                >
                  {step.isCompleted ? 'Review' : 'Complete'}
                  <HiMiniArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ))}
          </div>
        </Card>

        <Card className="border-white/10 bg-white/[0.03] p-6">
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
            Sidebar module
          </p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">
            Show Progress in the sidebar
          </h2>
          <p className="mt-3 text-sm leading-6 text-foreground/65">
            Keep the compact Progress module available in the main sidebar, or
            hide it until you want it back.
          </p>

          <InsetSurface className="mt-5" tone="contrast">
            <FormToggle
              label="Show Progress in sidebar"
              description="This controls the compact module that combines setup and streak into one closable block."
              isChecked={isVisible}
              isDisabled={isSaving}
              switchClassName={settingsToggleClassName}
              onChange={(event) => void setVisibility(event.target.checked)}
            />
          </InsetSurface>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <KeyMetric
              label="Freezes"
              value={isLoading ? '...' : streakFreezes}
              valueClassName="text-2xl"
            />
            <KeyMetric
              label="Setup status"
              value={completedCount === totalCount ? 'Ready' : 'In progress'}
              valueClassName="text-2xl"
            />
          </div>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
        <Card className="border-white/10 bg-white/[0.03] p-5">
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

          <div className="grid grid-cols-9 gap-2 md:grid-cols-15 lg:grid-cols-18">
            {heatmapDays.map((dayKey) => {
              const count = calendar[dayKey]?.count ?? 0;
              const intensityClass =
                count >= 4
                  ? 'bg-orange-300/80 border-orange-200/60'
                  : count >= 2
                    ? 'bg-orange-300/45 border-orange-300/40'
                    : count >= 1
                      ? 'bg-orange-300/25 border-orange-300/25'
                      : 'bg-white/[0.03] border-white/8';

              return (
                <div
                  key={dayKey}
                  className={cn(
                    'aspect-square rounded border transition-colors',
                    intensityClass,
                  )}
                  title={`${dayKey}${count > 0 ? `: ${count} item${count === 1 ? '' : 's'}` : ''}`}
                />
              );
            })}
          </div>
        </Card>

        <Card className="border-white/10 bg-white/[0.03] p-5">
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
                  <HiOutlineGift className="h-3.5 w-3.5" />
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
                  'rounded-2xl border p-4',
                  milestone.isAchieved
                    ? 'border-emerald-400/20 bg-emerald-400/8'
                    : milestone.isNext
                      ? 'border-orange-400/20 bg-orange-400/8'
                      : 'border-white/10 bg-black/10',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-semibold text-foreground">
                        {milestone.days} days
                      </span>
                      {milestone.days === 7 ? (
                        <HiOutlineShieldCheck className="h-4 w-4 text-sky-300" />
                      ) : milestone.rewardCredits > 0 ? (
                        <HiOutlineGift className="h-4 w-4 text-emerald-300" />
                      ) : (
                        <HiOutlineFire className="h-4 w-4 text-orange-300" />
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
      </section>
    </div>
  );
}
