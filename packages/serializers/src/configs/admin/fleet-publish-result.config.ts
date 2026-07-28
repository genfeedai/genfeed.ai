import { fleetPublishResultAttributes } from '@serializers/attributes/admin/fleet-publish-result.attributes';
import { simpleConfig } from '@serializers/builders';

export const fleetPublishResultSerializerConfig = simpleConfig(
  'fleet-publish-result',
  fleetPublishResultAttributes,
);
