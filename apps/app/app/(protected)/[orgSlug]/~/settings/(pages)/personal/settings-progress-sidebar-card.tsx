'use client';

import Card from '@ui/card/Card';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';
import KeyMetric from '@ui/display/key-metric/KeyMetric';
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
    <Card className="border-border bg-card p-6">
      <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
        Sidebar module
      </p>
      <h2 className="mt-1 text-xl font-semibold text-foreground">
        Show Progress in the sidebar
      </h2>
      <p className="mt-3 text-sm leading-6 text-foreground/65">
        Keep the compact Progress module available in the main sidebar, or hide
        it until you want it back.
      </p>

      <InsetSurface className="mt-5" tone="contrast">
        <Switch
          label="Show Progress in sidebar"
          description="This controls the compact module that combines setup and streak into one closable block."
          isChecked={isVisible}
          isDisabled={isSaving}
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
  );
}
