import { outlierBaselineSnapshotAttributes } from '@serializers/attributes/social/outlier-baseline-snapshot.attributes';
import { simpleConfig } from '@serializers/builders';
export const outlierBaselineSnapshotSerializerConfig = simpleConfig(
  'outlier-baseline-snapshot',
  outlierBaselineSnapshotAttributes,
);
