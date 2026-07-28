import { buildSerializer } from '@serializers/builders';
import { fleetPublishResultSerializerConfig } from '@serializers/configs';

export const { FleetPublishResultSerializer } = buildSerializer(
  'server',
  fleetPublishResultSerializerConfig,
);
