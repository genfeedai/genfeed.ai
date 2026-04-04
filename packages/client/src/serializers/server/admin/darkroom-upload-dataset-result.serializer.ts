import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { darkroomUploadDatasetResultSerializerConfig } from '../../configs';

export const DarkroomUploadDatasetResultSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  darkroomUploadDatasetResultSerializerConfig,
);
