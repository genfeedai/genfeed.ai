import { darkroomLipSyncStatusAttributes } from '../../attributes/admin/darkroom-lip-sync-status.attributes';
import { simpleConfig } from '../../builders';

export const darkroomLipSyncStatusSerializerConfig = simpleConfig(
  'darkroom-lip-sync-status',
  darkroomLipSyncStatusAttributes,
);
