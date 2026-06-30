import { buildSerializer } from '@serializers/builders';
import { fleetUploadDatasetResultSerializerConfig } from '@serializers/configs';

export const { FleetUploadDatasetResultSerializer } = buildSerializer(
  'server',
  fleetUploadDatasetResultSerializerConfig,
);
