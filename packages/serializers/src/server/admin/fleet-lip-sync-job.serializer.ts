import { buildSerializer } from '@serializers/builders';
import { fleetLipSyncJobSerializerConfig } from '@serializers/configs';

export const { FleetLipSyncJobSerializer } = buildSerializer(
  'server',
  fleetLipSyncJobSerializerConfig,
);
