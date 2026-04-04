import { buildSerializer } from '@serializers/builders/serializer.builder';
import { skillSerializerConfig } from '@serializers/configs/content/content-skill.config';

export const { SkillSerializer } = buildSerializer(
  'server',
  skillSerializerConfig,
);
