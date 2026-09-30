import { buildSerializer } from '@serializers/builders';
import { storyboardRunSerializerConfig } from '@serializers/configs/content/storyboard-run.config';
export const { StoryboardRunSerializer } = buildSerializer(
  'server',
  storyboardRunSerializerConfig,
);
