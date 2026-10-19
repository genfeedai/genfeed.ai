import type { Props } from '@props/settings/settings-progress-heatmap-card.props';
import CreationHeatmap from '@ui/analytics/creation-heatmap/CreationHeatmap';
import Card from '@ui/card/Card';

export default function SettingsProgressHeatmapCard({ calendar }: Props) {
  return (
    <Card label="Creation heatmap" bodyClassName="gap-3 p-4">
      <CreationHeatmap calendar={calendar} />
    </Card>
  );
}
