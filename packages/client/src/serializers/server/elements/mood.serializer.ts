import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { elementMoodSerializerConfig } from '../../configs';

export const ElementMoodSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  elementMoodSerializerConfig,
);

export { ElementMoodSerializer as MoodSerializer };
