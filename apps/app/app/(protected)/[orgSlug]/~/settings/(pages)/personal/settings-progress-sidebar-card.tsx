'use client';

import Card from '@ui/card/Card';
import { MetricSummary } from '@ui/cards/metric-card/MetricCard';
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

      <MetricSummary
        className="flex flex-wrap gap-y-2"
        items={[
          { label: 'freezes', value: isLoading ? '...' : streakFreezes },
          {
            label: 'setup status',
            value: completedCount === totalCount ? 'Ready' : 'In progress',
          },
        ]}
      />
    </Card>
  );
}
