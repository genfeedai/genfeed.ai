import { buildSerializer } from '@serializers/builders';
import { darkroomLipSyncJobSerializerConfig } from '@serializers/configs';

export const { DarkroomLipSyncJobSerializer } = buildSerializer(
  'server',
  darkroomLipSyncJobSerializerConfig,
);
