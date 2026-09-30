import { modelPricingReportAttributes } from '@serializers/attributes/admin/model-pricing-report.attributes';
import { simpleConfig } from '@serializers/builders';

export const modelPricingReportSerializerConfig = simpleConfig(
  'model-pricing-report',
  modelPricingReportAttributes,
);
