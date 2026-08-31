import { buildSerializer } from '@serializers/builders';
import { skillsProInstallationSerializerConfig } from '@serializers/configs/skills-pro/skills-pro-installation.config';

export const { SkillsProInstallationSerializer } = buildSerializer(
  'server',
  skillsProInstallationSerializerConfig,
);
