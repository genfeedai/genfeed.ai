import { fleetCapabilitiesAttributes } from '@serializers/attributes/organizations/fleet-capabilities.attributes';
import { simpleConfig } from '@serializers/builders';

export const fleetCapabilitiesSerializerConfig = simpleConfig(
  'fleet-capabilities',
  fleetCapabilitiesAttributes,
);
