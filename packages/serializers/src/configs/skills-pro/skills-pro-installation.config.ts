import { skillsProInstallationAttributes } from '@serializers/attributes/skills-pro/skills-pro-installation.attributes';
import { simpleConfig } from '@serializers/builders';

export const skillsProInstallationSerializerConfig = simpleConfig(
  'skills-pro-installation',
  skillsProInstallationAttributes,
);
