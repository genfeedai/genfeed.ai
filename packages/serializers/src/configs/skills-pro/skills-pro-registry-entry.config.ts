import { skillsProRegistryEntryAttributes } from '@serializers/attributes/skills-pro/skills-pro-registry-entry.attributes';
import { simpleConfig } from '@serializers/builders';

export const skillsProRegistryEntrySerializerConfig = simpleConfig(
  'skills-pro-registry-entry',
  skillsProRegistryEntryAttributes,
);
