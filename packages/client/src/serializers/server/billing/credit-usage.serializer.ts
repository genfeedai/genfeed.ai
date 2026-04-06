import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { creditUsageSerializerConfig } from '../../configs';

export const CreditUsageSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  creditUsageSerializerConfig,
);
