import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { contentSkillSerializerConfig } from '../../configs';

export const ContentSkillSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  contentSkillSerializerConfig,
);
