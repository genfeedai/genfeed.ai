import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { contentSkillSerializerConfig } from '../../configs';

export const ContentSkillSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  contentSkillSerializerConfig,
);
