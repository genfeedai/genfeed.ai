import { darkroomLipSyncStatusAttributes } from '@serializers/attributes/admin/darkroom-lip-sync-status.attributes';
import { simpleConfig } from '@serializers/builders';

export const darkroomLipSyncStatusSerializerConfig = simpleConfig(
  'darkroom-lip-sync-status',
  darkroomLipSyncStatusAttributes,
);
