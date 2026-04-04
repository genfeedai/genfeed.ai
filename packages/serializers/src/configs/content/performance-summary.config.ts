import { performanceSummaryAttributes } from '@serializers/attributes/content/performance-summary.attributes';
import { simpleConfig } from '@serializers/builders';

export const performanceSummarySerializerConfig = simpleConfig(
  'performance-summary',
  performanceSummaryAttributes,
);
