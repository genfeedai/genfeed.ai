import { buildSerializer } from '@serializers/builders';
import { crmMonthlyMarginSerializerConfig } from '@serializers/configs';

export const { CrmMonthlyMarginSerializer } = buildSerializer(
  'server',
  crmMonthlyMarginSerializerConfig,
);
