import { fleetUploadDatasetResultAttributes } from '@serializers/attributes/admin/fleet-upload-dataset-result.attributes';
import { simpleConfig } from '@serializers/builders';

export const fleetUploadDatasetResultSerializerConfig = simpleConfig(
  'fleet-upload-dataset-result',
  fleetUploadDatasetResultAttributes,
);
