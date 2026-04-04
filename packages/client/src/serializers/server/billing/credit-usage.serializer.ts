import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { creditUsageSerializerConfig } from '../../configs';

export const CreditUsageSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  creditUsageSerializerConfig,
);
