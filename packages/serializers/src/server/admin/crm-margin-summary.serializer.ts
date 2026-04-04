import { buildSerializer } from '@serializers/builders';
import { crmMarginSummarySerializerConfig } from '@serializers/configs';

export const { CrmMarginSummarySerializer } = buildSerializer(
  'server',
  crmMarginSummarySerializerConfig,
);
