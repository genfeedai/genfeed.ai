import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { distributionSerializerConfig } from '../../configs';

export const DistributionSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  distributionSerializerConfig,
);
