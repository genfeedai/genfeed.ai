import { buildSerializer } from '@serializers/builders';
import { modelPricingReportSerializerConfig } from '@serializers/configs';

export const { ModelPricingReportSerializer } = buildSerializer(
  'server',
  modelPricingReportSerializerConfig,
);
