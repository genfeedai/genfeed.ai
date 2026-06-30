import { fleetGenerationJobAttributes } from '@serializers/attributes/admin/fleet-generation-job.attributes';
import { simpleConfig } from '@serializers/builders';

export const fleetGenerationJobSerializerConfig = simpleConfig(
  'fleet-generation-job',
  fleetGenerationJobAttributes,
);
