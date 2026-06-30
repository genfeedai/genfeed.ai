import { fleetLipSyncJobAttributes } from '@serializers/attributes/admin/fleet-lip-sync-job.attributes';
import { simpleConfig } from '@serializers/builders';

export const fleetLipSyncJobSerializerConfig = simpleConfig(
  'fleet-lip-sync-job',
  fleetLipSyncJobAttributes,
);
