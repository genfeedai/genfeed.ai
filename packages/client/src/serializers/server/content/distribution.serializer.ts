import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { distributionSerializerConfig } from '../../configs';

export const DistributionSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  distributionSerializerConfig,
);
