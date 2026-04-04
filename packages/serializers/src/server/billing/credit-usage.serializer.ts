import { buildSerializer } from '@serializers/builders';
import { creditUsageSerializerConfig } from '@serializers/configs';

export const { CreditUsageSerializer } = buildSerializer(
  'server',
  creditUsageSerializerConfig,
);
