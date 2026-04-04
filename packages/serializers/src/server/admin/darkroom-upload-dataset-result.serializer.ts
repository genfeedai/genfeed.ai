import { buildSerializer } from '@serializers/builders';
import { darkroomUploadDatasetResultSerializerConfig } from '@serializers/configs';

export const { DarkroomUploadDatasetResultSerializer } = buildSerializer(
  'server',
  darkroomUploadDatasetResultSerializerConfig,
);
