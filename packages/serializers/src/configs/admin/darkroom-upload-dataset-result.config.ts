import { darkroomUploadDatasetResultAttributes } from '@serializers/attributes/admin/darkroom-upload-dataset-result.attributes';
import { simpleConfig } from '@serializers/builders';

export const darkroomUploadDatasetResultSerializerConfig = simpleConfig(
  'darkroom-upload-dataset-result',
  darkroomUploadDatasetResultAttributes,
);
