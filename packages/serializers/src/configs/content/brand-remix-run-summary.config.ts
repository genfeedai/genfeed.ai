import { brandRemixRunSummaryAttributes } from '@serializers/attributes/content/brand-remix-run-summary.attributes';
import { simpleConfig } from '@serializers/builders';

export const brandRemixRunSummarySerializerConfig = simpleConfig(
  'brand-remix-run-summary',
  brandRemixRunSummaryAttributes,
);
