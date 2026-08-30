import { buildSerializer } from '@serializers/builders';
import { skillsProRegistryEntrySerializerConfig } from '@serializers/configs/skills-pro/skills-pro-registry-entry.config';

export const { SkillsProRegistryEntrySerializer } = buildSerializer(
  'server',
  skillsProRegistryEntrySerializerConfig,
);
