import { performanceSummaryAttributes } from '../../attributes/content/performance-summary.attributes';
import { simpleConfig } from '../../builders';

export const performanceSummarySerializerConfig = simpleConfig(
  'performance-summary',
  performanceSummaryAttributes,
);
