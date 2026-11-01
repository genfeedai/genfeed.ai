import Card from '@ui/card/Card';
import { MetricSummary } from '@ui/cards/metric-card/MetricCard';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';
import { Switch } from '@ui/primitives/switch';
import type { Props } from '@/features/settings/props/settings-progress-sidebar-card.props';

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
    <Card label="Sidebar module">
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
