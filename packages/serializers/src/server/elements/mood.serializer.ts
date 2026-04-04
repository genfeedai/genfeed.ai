import { buildSerializer } from '@serializers/builders';
import { elementMoodSerializerConfig } from '@serializers/configs';

export const { ElementMoodSerializer } = buildSerializer(
  'server',
  elementMoodSerializerConfig,
);

export { ElementMoodSerializer as MoodSerializer };
