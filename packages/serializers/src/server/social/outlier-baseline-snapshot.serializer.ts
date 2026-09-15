import { buildSerializer } from '@serializers/builders';
import { outlierBaselineSnapshotSerializerConfig } from '@serializers/configs/social/outlier-baseline-snapshot.config';
export const { OutlierBaselineSnapshotSerializer } = buildSerializer(
  'server',
  outlierBaselineSnapshotSerializerConfig,
);
