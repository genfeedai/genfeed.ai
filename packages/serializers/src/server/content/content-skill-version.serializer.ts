import { buildSingleSerializer } from '@serializers/builders/serializer.builder';
import {
  skillVersionMetadataSerializerConfig,
  skillVersionReadSerializerConfig,
} from '@serializers/configs/content/content-skill-version.config';

export const SkillVersionMetadataSerializer = buildSingleSerializer(
  'server',
  skillVersionMetadataSerializerConfig,
);
export const SkillVersionReadSerializer = buildSingleSerializer(
  'server',
  skillVersionReadSerializerConfig,
);
