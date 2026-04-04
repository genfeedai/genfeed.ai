import { projectAttributes } from '@serializers/attributes/management/project.attributes';
import { simpleConfig } from '@serializers/builders';

export const projectSerializerConfig = simpleConfig(
  'project',
  projectAttributes,
);
