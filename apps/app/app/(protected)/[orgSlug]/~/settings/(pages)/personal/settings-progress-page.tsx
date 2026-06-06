'use client';

import { useStreak } from '@hooks/data/streaks/use-streak/use-streak';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useSetupCard } from '@hooks/utils/use-setup-card/use-setup-card';
import { useSidebarProgressPreference } from '@hooks/utils/use-sidebar-progress-preference/use-sidebar-progress-preference';
import { useMemo } from 'react';
import SettingsProgressChecklistCard from './settings-progress-checklist-card';
import SettingsProgressHeatmapCard from './settings-progress-heatmap-card';
import SettingsProgressOverviewCard from './settings-progress-overview-card';
import SettingsProgressRewardsCard from './settings-progress-rewards-card';
import SettingsProgressSidebarCard from './settings-progress-sidebar-card';

function formatDayKey(offsetFromEnd: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetFromEnd);
  return date.toISOString().slice(0, 10);
}

interface SettingsProgressPageProps {
  showOverviewCard?: boolean;
}

export default function SettingsProgressPage({
  showOverviewCard = true,
}: SettingsProgressPageProps) {
  const { completedCount, steps, totalCount } = useSetupCard();
  const { orgHref } = useOrgUrl();
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
        <SettingsProgressOverviewCard
          completedCount={completedCount}
          currentStreak={currentStreak}
          isLoading={isLoading}
          longestStreak={longestStreak}
          nextMilestone={nextMilestone}
          nextSetupStep={nextSetupStep}
          orgHref={orgHref}
          totalCount={totalCount}
        />
      )}

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <SettingsProgressChecklistCard
          completedCount={completedCount}
          steps={steps}
          totalCount={totalCount}
        />
        <SettingsProgressSidebarCard
          completedCount={completedCount}
          isLoading={isLoading}
          isSaving={isSaving}
          isVisible={isVisible}
          setVisibility={setVisibility}
          streakFreezes={streakFreezes}
          totalCount={totalCount}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
        <SettingsProgressHeatmapCard
          calendar={calendar}
          heatmapDays={heatmapDays}
        />
        <SettingsProgressRewardsCard
          badgeMilestones={badgeMilestones}
          milestoneStates={milestoneStates}
        />
      </section>
    </div>
  );
}
