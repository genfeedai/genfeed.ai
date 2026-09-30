import { buildSerializer } from '@serializers/builders';
import { storyboardRunSummarySerializerConfig } from '@serializers/configs/content/storyboard-run-summary.config';
export const { StoryboardRunSummarySerializer } = buildSerializer(
  'server',
  storyboardRunSummarySerializerConfig,
);
