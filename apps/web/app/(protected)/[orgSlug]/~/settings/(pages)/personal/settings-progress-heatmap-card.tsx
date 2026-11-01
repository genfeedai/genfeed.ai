import Card from '@ui/card/Card';
import CreationHeatmap from '@/components/analytics/creation-heatmap/CreationHeatmap';
import type { Props } from '@/features/settings/props/settings-progress-heatmap-card.props';

export default function SettingsProgressHeatmapCard({ calendar }: Props) {
  return (
    <Card label="Creation heatmap">
      <CreationHeatmap calendar={calendar} />
    </Card>
  );
}
