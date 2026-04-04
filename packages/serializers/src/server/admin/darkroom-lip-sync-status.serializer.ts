import { buildSerializer } from '@serializers/builders';
import { darkroomLipSyncStatusSerializerConfig } from '@serializers/configs';

export const { DarkroomLipSyncStatusSerializer } = buildSerializer(
  'server',
  darkroomLipSyncStatusSerializerConfig,
);
