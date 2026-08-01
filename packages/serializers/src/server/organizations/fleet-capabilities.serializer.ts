import { buildSerializer } from '@serializers/builders';
import { fleetCapabilitiesSerializerConfig } from '@serializers/configs/organizations/fleet-capabilities.config';

export const { FleetCapabilitiesSerializer } = buildSerializer(
  'server',
  fleetCapabilitiesSerializerConfig,
);
