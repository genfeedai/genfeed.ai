import { fleetLipSyncStatusAttributes } from '@serializers/attributes/admin/fleet-lip-sync-status.attributes';
import { simpleConfig } from '@serializers/builders';

export const fleetLipSyncStatusSerializerConfig = simpleConfig(
  'fleet-lip-sync-status',
  fleetLipSyncStatusAttributes,
);
