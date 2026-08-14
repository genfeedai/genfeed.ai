'use client';

import Card from '@ui/card/Card';
import MetricCard from '@ui/cards/metric-card/MetricCard';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';
import { Switch } from '@ui/primitives/switch';

type Props = {
  isSaving: boolean;
  isVisible: boolean;
  isLoading: boolean;
  streakFreezes: number;
  completedCount: number;
  totalCount: number;
  setVisibility: (visible: boolean) => Promise<void>;
};

export default function SettingsProgressSidebarCard({
  isSaving,
  isVisible,
  isLoading,
  streakFreezes,
  completedCount,
  totalCount,
  setVisibility,
}: Props) {
  return (
    <Card
      label="Sidebar module"
      description="Keep the compact Progress module available in the main sidebar, or hide it until you want it back."
      bodyClassName="gap-3 p-4"
    >
      <InsetSurface tone="contrast">
        <Switch
          label="Show Progress in sidebar"
          description="This controls the compact module that combines setup and streak into one closable block."
          isChecked={isVisible}
          isDisabled={isSaving}
          onChange={(event) => void setVisibility(event.target.checked)}
        />
      </InsetSurface>

      <div className="grid gap-3 sm:grid-cols-2">
        <MetricCard
          label="Freezes"
          size="md"
          value={isLoading ? '...' : streakFreezes}
          valueClassName="text-2xl"
        />
        <MetricCard
          label="Setup status"
          size="md"
          value={completedCount === totalCount ? 'Ready' : 'In progress'}
          valueClassName="text-2xl"
        />
      </div>
    </Card>
  );
}
