import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { darkroomLipSyncJobSerializerConfig } from '../../configs';

export const DarkroomLipSyncJobSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  darkroomLipSyncJobSerializerConfig,
);
