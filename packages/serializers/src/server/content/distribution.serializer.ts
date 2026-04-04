import { buildSerializer } from '@serializers/builders';
import { distributionSerializerConfig } from '@serializers/configs';

export const { DistributionSerializer } = buildSerializer(
  'server',
  distributionSerializerConfig,
);
