import { buildSerializer } from '@serializers/builders';
import { fleetLipSyncStatusSerializerConfig } from '@serializers/configs';

export const { FleetLipSyncStatusSerializer } = buildSerializer(
  'server',
  fleetLipSyncStatusSerializerConfig,
);
