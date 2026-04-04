import { darkroomLipSyncJobAttributes } from '@serializers/attributes/admin/darkroom-lip-sync-job.attributes';
import { simpleConfig } from '@serializers/builders';

export const darkroomLipSyncJobSerializerConfig = simpleConfig(
  'darkroom-lip-sync-job',
  darkroomLipSyncJobAttributes,
);
