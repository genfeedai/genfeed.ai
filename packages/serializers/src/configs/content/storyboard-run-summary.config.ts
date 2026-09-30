import { storyboardRunSummaryAttributes } from '@serializers/attributes/content/storyboard-run-summary.attributes';
import { simpleConfig } from '@serializers/builders';
export const storyboardRunSummarySerializerConfig = simpleConfig(
  'storyboard-run-summary',
  storyboardRunSummaryAttributes,
);
