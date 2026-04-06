import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { darkroomUploadDatasetResultSerializerConfig } from '../../configs';

export const DarkroomUploadDatasetResultSerializer: BuiltSerializer =
  buildSingleSerializer('server', darkroomUploadDatasetResultSerializerConfig);
