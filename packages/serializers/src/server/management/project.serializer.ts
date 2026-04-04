import { buildSerializer } from '@serializers/builders';
import { projectSerializerConfig } from '@serializers/configs';

export const { ProjectSerializer } = buildSerializer(
  'server',
  projectSerializerConfig,
);
