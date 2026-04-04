import { darkroomLipSyncJobAttributes } from '../../attributes/admin/darkroom-lip-sync-job.attributes';
import { simpleConfig } from '../../builders';

export const darkroomLipSyncJobSerializerConfig = simpleConfig(
  'darkroom-lip-sync-job',
  darkroomLipSyncJobAttributes,
);
